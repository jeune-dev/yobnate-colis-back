const barcode = require('./barcode');
const { formater } = require('./devise');
const { PAYS } = require('../constants/pays');
const { LIBELLES_TYPES_POINT } = require('../constants/reseau');

/**
 * Génération des documents d'exploitation au format HTML imprimable.
 *
 * Le HTML est retenu plutôt qu'un PDF binaire : il s'imprime nativement depuis
 * n'importe quel navigateur ou poste d'agence, s'affiche tel quel dans un
 * back-office, et n'introduit aucune dépendance de rendu côté serveur. Les
 * code-barres sont des SVG calculés en interne, donc scannables à l'impression.
 */

const echapper = (valeur) =>
  String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const dateFr = (valeur) => {
  if (!valeur) return '—';
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return String(valeur);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const dateHeureFr = (valeur) => {
  if (!valeur) return '—';
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return String(valeur);
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const STYLE_COMMUN = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12mm; font-family: Helvetica, Arial, sans-serif; color: #111; font-size: 12px; }
  h1, h2, h3 { margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; text-align: left; vertical-align: top; }
  thead th { background: #0b3d2c; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  tbody tr:nth-child(even) { background: #f6f7f8; }
  .cadre { border: 1px solid #111; }
  .muted { color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  .total { font-size: 16px; font-weight: bold; }
  .droite { text-align: right; }
  .centre { text-align: center; }
  @media print { body { padding: 6mm; } .sans-impression { display: none; } }
`;

const page = (titre, contenu, styleSupplementaire = '') => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(titre)}</title>
<style>${STYLE_COMMUN}${styleSupplementaire}</style>
</head><body>${contenu}</body></html>`;

/* ── Étiquette d'expédition ─────────────────────────────────────────────── */

const bloc = (titre, lignes) => `
  <div style="flex:1;padding:8px;">
    <div class="muted">${echapper(titre)}</div>
    ${lignes
      .filter(Boolean)
      .map((l) => `<div>${l}</div>`)
      .join('')}
  </div>`;

/**
 * Étiquette à coller sur le colis : numéro de suivi en code-barres, corridor,
 * coordonnées des deux parties, gabarit et point de retrait.
 * Une étiquette est produite par pièce dans une expédition multi-colis.
 */
const genererEtiquette = (colis, { piece = null, point = null } = {}) => {
  const numero = piece?.numeroSuivi || colis.reference;
  const rang = piece ? `${piece.ordre} / ${colis.nbPieces}` : `1 / ${colis.nbPieces}`;
  const paysDepart = PAYS[colis.paysDepart]?.libelle || colis.paysDepart;
  const paysArrivee = PAYS[colis.paysArrivee]?.libelle || colis.paysArrivee;

  const contenu = `
  <div class="cadre" style="width:105mm;">
    <div style="display:flex;justify-content:space-between;align-items:center;background:#0b3d2c;color:#fff;padding:8px 10px;">
      <strong style="font-size:15px;letter-spacing:1px;">YOBNATE EXPRESS</strong>
      <span style="font-size:11px;">${echapper(colis.service?.nom || '')}</span>
    </div>

    <div style="display:flex;border-bottom:1px solid #111;">
      ${bloc('Expéditeur', [
        `<strong>${echapper(colis.expediteurNom)}</strong>`,
        colis.expediteurEntreprise ? echapper(colis.expediteurEntreprise) : null,
        echapper(colis.adresseDepart || ''),
        `${echapper(colis.villeDepart?.nom || '')} — ${echapper(paysDepart)}`,
        echapper(colis.expediteurTelephone),
      ])}
    </div>

    <div style="display:flex;border-bottom:1px solid #111;background:#f6f7f8;">
      ${bloc('Destinataire', [
        `<strong style="font-size:15px;">${echapper(colis.destinataireNom)}</strong>`,
        colis.destinataireEntreprise ? echapper(colis.destinataireEntreprise) : null,
        echapper(colis.adresseLivraison || ''),
        `<strong>${echapper(colis.villeArrivee?.nom || '')} ${echapper(colis.codePostalArrivee || '')} — ${echapper(paysArrivee)}</strong>`,
        `Tél. ${echapper(colis.destinataireTelephone)}`,
      ])}
    </div>

    ${
      point
        ? `<div style="padding:6px 10px;border-bottom:1px solid #111;">
      <span class="muted">Point de retrait</span>
      <div><strong>${echapper(point.nom)}</strong> — ${echapper(point.code)}</div>
      <div>${echapper(point.adresse)}</div>
    </div>`
        : ''
    }

    <div style="display:flex;border-bottom:1px solid #111;text-align:center;">
      <div style="flex:1;padding:6px;border-right:1px solid #111;">
        <div class="muted">Pièce</div><strong style="font-size:16px;">${echapper(rang)}</strong>
      </div>
      <div style="flex:1;padding:6px;border-right:1px solid #111;">
        <div class="muted">Poids</div><strong style="font-size:16px;">${echapper(Number(piece?.poidsKg ?? colis.poidsFactureKg))} kg</strong>
      </div>
      <div style="flex:1;padding:6px;">
        <div class="muted">Contenu</div><strong>${echapper(colis.typeContenu)}</strong>
      </div>
    </div>

    ${
      colis.fragile || colis.marchandiseDangereuse
        ? `<div style="padding:6px 10px;border-bottom:1px solid #111;font-weight:bold;letter-spacing:1px;">
      ${colis.fragile ? '&#9888; FRAGILE — MANIPULER AVEC PRÉCAUTION' : ''}
      ${colis.marchandiseDangereuse ? '&#9888; MARCHANDISE RÉGLEMENTÉE' : ''}
    </div>`
        : ''
    }

    <div class="centre" style="padding:10px 6px;">
      ${barcode.versSvg(numero, { moduleWidth: 2, hauteur: 64 })}
    </div>

    <div style="display:flex;justify-content:space-between;padding:6px 10px;border-top:1px solid #111;font-size:11px;">
      <span>${echapper(colis.paysDepart)} &#8594; ${echapper(colis.paysArrivee)}</span>
      <span>Livraison estimée : ${echapper(dateFr(colis.dateLivraisonEstimee))}</span>
    </div>
  </div>`;

  return page(`Étiquette ${numero}`, contenu, '@page { size: A6; margin: 4mm; }');
};

/** Planche regroupant les étiquettes de toutes les pièces d'une expédition. */
const genererEtiquettes = (colis, pieces = [], point = null) => {
  const liste = pieces.length ? pieces : [null];
  const corps = liste
    .map((piece) =>
      genererEtiquette(colis, { piece, point })
        .replace(/^[\s\S]*<body>/, '')
        .replace(/<\/body>[\s\S]*$/, '')
    )
    .join('<div style="page-break-after:always;"></div>');
  return page(`Étiquettes ${colis.reference}`, corps, '@page { size: A6; margin: 4mm; }');
};

/* ── Facture commerciale (douane) ───────────────────────────────────────── */

/**
 * Facture commerciale exigée au dédouanement : identité des parties, description
 * détaillée des marchandises, codes SH, valeurs et incoterm.
 */
const genererFactureCommerciale = (colis, declaration, articles = [], entreprise = {}) => {
  const devise = declaration.devise;
  const totalArticles = articles.reduce(
    (acc, a) => acc + Number(a.quantite) * Number(a.valeurUnitaire),
    0
  );

  const lignes = articles
    .map(
      (a, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${echapper(a.designation)}${a.marque ? `<br><span class="muted">${echapper(a.marque)}</span>` : ''}</td>
      <td>${echapper(a.codeSh || '—')}</td>
      <td>${echapper(a.paysOrigine || '—')}</td>
      <td class="droite">${echapper(Number(a.quantite))} ${echapper(a.unite)}</td>
      <td class="droite">${echapper(formater(a.valeurUnitaire, devise))}</td>
      <td class="droite">${echapper(formater(Number(a.quantite) * Number(a.valeurUnitaire), devise))}</td>
    </tr>`
    )
    .join('');

  const contenu = `
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0b3d2c;padding-bottom:8px;">
      <div>
        <h1 style="color:#0b3d2c;">FACTURE COMMERCIALE</h1>
        <div class="muted">Commercial invoice — pour usage douanier</div>
      </div>
      <div class="droite">
        <div><strong>N° ${echapper(declaration.factureCommercialeNumero || declaration.id)}</strong></div>
        <div>Date : ${echapper(dateFr(declaration.createdAt || new Date()))}</div>
        <div>LTA : <strong>${echapper(colis.reference)}</strong></div>
      </div>
    </div>

    <div style="display:flex;gap:12px;margin:12px 0;">
      <div class="cadre" style="flex:1;padding:8px;">
        <div class="muted">Expéditeur / Exportateur</div>
        <strong>${echapper(colis.expediteurNom)}</strong><br>
        ${colis.expediteurEntreprise ? `${echapper(colis.expediteurEntreprise)}<br>` : ''}
        ${echapper(colis.adresseDepart || '')}<br>
        ${echapper(colis.villeDepart?.nom || '')} — ${echapper(PAYS[colis.paysDepart]?.libelle)}<br>
        Tél. ${echapper(colis.expediteurTelephone)}<br>
        ${declaration.numeroEori ? `EORI : ${echapper(declaration.numeroEori)}<br>` : ''}
        ${declaration.numeroNinea ? `NINEA : ${echapper(declaration.numeroNinea)}` : ''}
      </div>
      <div class="cadre" style="flex:1;padding:8px;">
        <div class="muted">Destinataire / Importateur</div>
        <strong>${echapper(colis.destinataireNom)}</strong><br>
        ${colis.destinataireEntreprise ? `${echapper(colis.destinataireEntreprise)}<br>` : ''}
        ${echapper(colis.adresseLivraison || '')}<br>
        ${echapper(colis.villeArrivee?.nom || '')} ${echapper(colis.codePostalArrivee || '')} —
        ${echapper(PAYS[colis.paysArrivee]?.libelle)}<br>
        Tél. ${echapper(colis.destinataireTelephone)}
      </div>
    </div>

    <table class="cadre" style="margin-bottom:12px;">
      <tbody>
        <tr>
          <td><span class="muted">Motif de l'exportation</span><br><strong>${echapper(declaration.motifExport)}</strong></td>
          <td><span class="muted">Incoterm</span><br><strong>${echapper(declaration.incoterm)}</strong></td>
          <td><span class="muted">Poids brut</span><br><strong>${echapper(Number(declaration.poidsBrutKg || colis.poidsReelKg))} kg</strong></td>
          <td><span class="muted">Nombre de pièces</span><br><strong>${echapper(colis.nbPieces)}</strong></td>
        </tr>
      </tbody>
    </table>

    <table class="cadre">
      <thead><tr>
        <th>#</th><th>Désignation des marchandises</th><th>Code SH</th><th>Origine</th>
        <th class="droite">Quantité</th><th class="droite">Prix unitaire</th><th class="droite">Montant</th>
      </tr></thead>
      <tbody>${lignes || '<tr><td colspan="7" class="centre">Aucun article déclaré</td></tr>'}</tbody>
    </table>

    <table style="margin-top:12px;width:60%;margin-left:auto;">
      <tr><td class="droite">Valeur des marchandises</td>
          <td class="droite">${echapper(formater(totalArticles, devise))}</td></tr>
      <tr><td class="droite">Frais de transport</td>
          <td class="droite">${echapper(formater(declaration.fraisTransport, devise))}</td></tr>
      <tr><td class="droite">Assurance</td>
          <td class="droite">${echapper(formater(declaration.fraisAssurance, devise))}</td></tr>
      <tr><td class="droite total">Valeur totale déclarée</td>
          <td class="droite total">${echapper(
            formater(
              Number(totalArticles) +
                Number(declaration.fraisTransport) +
                Number(declaration.fraisAssurance),
              devise
            )
          )}</td></tr>
    </table>

    <div style="margin-top:20px;font-size:11px;">
      <p>Je certifie que les renseignements portés sur cette facture sont exacts et que le contenu
      de cet envoi est conforme à la description ci-dessus.</p>
      <div style="display:flex;justify-content:space-between;margin-top:32px;">
        <div>Nom et signature de l'expéditeur<br><br>_______________________________</div>
        <div>Date<br><br>${echapper(dateFr(new Date()))}</div>
      </div>
    </div>

    <div style="margin-top:16px;border-top:1px solid #ccc;padding-top:6px;" class="muted">
      ${echapper(entreprise.entreprise_nom || 'Yobnate Express')}
      ${entreprise.entreprise_adresse ? ` — ${echapper(entreprise.entreprise_adresse)}` : ''}
      ${entreprise.entreprise_email ? ` — ${echapper(entreprise.entreprise_email)}` : ''}
    </div>`;

  return page(
    `Facture commerciale ${colis.reference}`,
    contenu,
    '@page { size: A4; margin: 10mm; }'
  );
};

/* ── Facture de transport ───────────────────────────────────────────────── */

/** Facture de la prestation de transport, remise au payeur. */
const genererFactureTransport = (facture, colis, entreprise = {}) => {
  const devise = facture.devise;
  const lignes = (facture.lignes || [])
    .map(
      (l) => `
    <tr><td>${echapper(l.libelle)}</td><td class="droite">${echapper(formater(l.montant, devise))}</td></tr>`
    )
    .join('');

  const contenu = `
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0b3d2c;padding-bottom:8px;">
      <div>
        <h1 style="color:#0b3d2c;">${echapper(entreprise.entreprise_nom || 'Yobnate Express')}</h1>
        <div class="muted">${echapper(entreprise.entreprise_adresse || '')}</div>
        <div class="muted">${echapper(entreprise.entreprise_email || '')} ${echapper(entreprise.entreprise_telephone || '')}</div>
      </div>
      <div class="droite">
        <h2>FACTURE</h2>
        <div><strong>${echapper(facture.reference)}</strong></div>
        <div>Émise le ${echapper(dateFr(facture.dateEmission))}</div>
        ${facture.dateLimitePaiement ? `<div>Échéance : ${echapper(dateFr(facture.dateLimitePaiement))}</div>` : ''}
      </div>
    </div>

    <div style="display:flex;gap:12px;margin:12px 0;">
      <div class="cadre" style="flex:1;padding:8px;">
        <div class="muted">Facturé à</div>
        <strong>${echapper(facture.User?.nomComplet || `${facture.User?.prenom || ''} ${facture.User?.nom || ''}`)}</strong><br>
        ${echapper(facture.User?.raisonSociale || '')}<br>
        ${echapper(facture.User?.email || '')}
      </div>
      ${
        colis
          ? `<div class="cadre" style="flex:1;padding:8px;">
        <div class="muted">Expédition</div>
        <strong>${echapper(colis.reference)}</strong><br>
        ${echapper(colis.villeDepart?.nom || '')} &#8594; ${echapper(colis.villeArrivee?.nom || '')}<br>
        ${echapper(Number(colis.poidsFactureKg))} kg — ${echapper(colis.nbPieces)} pièce(s)
      </div>`
          : ''
      }
    </div>

    <table class="cadre">
      <thead><tr><th>Désignation</th><th class="droite">Montant</th></tr></thead>
      <tbody>${lignes || `<tr><td>Prestation de transport</td><td class="droite">${echapper(formater(facture.montantFret, devise))}</td></tr>`}</tbody>
    </table>

    <table style="margin-top:12px;width:55%;margin-left:auto;">
      <tr><td class="droite">Total hors taxes</td><td class="droite">${echapper(formater(facture.montantHt, devise))}</td></tr>
      ${Number(facture.remise) > 0 ? `<tr><td class="droite">Remise</td><td class="droite">- ${echapper(formater(facture.remise, devise))}</td></tr>` : ''}
      <tr><td class="droite">TVA (${echapper(Number(facture.tauxTva))} %)</td><td class="droite">${echapper(formater(facture.montantTva, devise))}</td></tr>
      ${Number(facture.montantDroitsDouane) > 0 ? `<tr><td class="droite">Droits et taxes à l'import</td><td class="droite">${echapper(formater(facture.montantDroitsDouane, devise))}</td></tr>` : ''}
      <tr><td class="droite total">Total à régler</td><td class="droite total">${echapper(formater(facture.montantTotal, devise))}</td></tr>
      ${
        Number(facture.montantPaye) > 0
          ? `<tr><td class="droite">Déjà réglé</td><td class="droite">${echapper(formater(facture.montantPaye, devise))}</td></tr>
      <tr><td class="droite total">Solde dû</td><td class="droite total">${echapper(formater(Number(facture.montantTotal) - Number(facture.montantPaye), devise))}</td></tr>`
          : ''
      }
    </table>

    <div style="margin-top:24px;font-size:11px;color:#555;">
      ${echapper(facture.mentions || entreprise.mentions_facture || '')}
      ${entreprise.entreprise_ninea ? `<br>NINEA : ${echapper(entreprise.entreprise_ninea)}` : ''}
      ${entreprise.entreprise_siret ? ` — SIRET : ${echapper(entreprise.entreprise_siret)}` : ''}
    </div>`;

  return page(`Facture ${facture.reference}`, contenu, '@page { size: A4; margin: 12mm; }');
};

/* ── Manifeste de rotation ──────────────────────────────────────────────── */

/**
 * Manifeste : liste exhaustive des colis embarqués sur une rotation, remise au
 * transporteur et aux autorités douanières.
 */
const genererManifeste = (rotation, colisList = [], entreprise = {}) => {
  const totalPoids = colisList.reduce((acc, c) => acc + Number(c.poidsFactureKg || 0), 0);
  const totalPieces = colisList.reduce((acc, c) => acc + Number(c.nbPieces || 0), 0);
  const totalValeur = colisList.reduce((acc, c) => acc + Number(c.valeurDeclaree || 0), 0);

  const lignes = colisList
    .map(
      (c, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${echapper(c.reference)}</strong></td>
      <td>${echapper(c.expediteurNom)}</td>
      <td>${echapper(c.destinataireNom)}<br><span class="muted">${echapper(c.villeArrivee?.nom || '')}</span></td>
      <td class="droite">${echapper(c.nbPieces)}</td>
      <td class="droite">${echapper(Number(c.poidsFactureKg))}</td>
      <td>${echapper(c.typeContenu)}</td>
      <td class="droite">${echapper(Number(c.valeurDeclaree))}</td>
    </tr>`
    )
    .join('');

  const contenu = `
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0b3d2c;padding-bottom:8px;">
      <div>
        <h1 style="color:#0b3d2c;">MANIFESTE DE CHARGEMENT</h1>
        <div class="muted">${echapper(entreprise.entreprise_nom || 'Yobnate Express')}</div>
      </div>
      <div class="droite">
        <div><strong>${echapper(rotation.numeroManifeste || rotation.reference)}</strong></div>
        <div>Rotation ${echapper(rotation.reference)}</div>
        <div>Édité le ${echapper(dateHeureFr(new Date()))}</div>
      </div>
    </div>

    <table class="cadre" style="margin:12px 0;">
      <tbody><tr>
        <td><span class="muted">Corridor</span><br><strong>${echapper(PAYS[rotation.paysDepart]?.libelle)} &#8594; ${echapper(PAYS[rotation.paysArrivee]?.libelle)}</strong></td>
        <td><span class="muted">Mode</span><br><strong>${echapper(rotation.modeTransport)}</strong></td>
        <td><span class="muted">Transporteur</span><br><strong>${echapper(rotation.transporteur || '—')}</strong></td>
        <td><span class="muted">Vol / conteneur</span><br><strong>${echapper(rotation.numeroVol || rotation.numeroConteneur || '—')}</strong></td>
        <td><span class="muted">Départ prévu</span><br><strong>${echapper(dateHeureFr(rotation.dateDepartPrevue))}</strong></td>
        <td><span class="muted">Arrivée prévue</span><br><strong>${echapper(dateHeureFr(rotation.dateArriveePrevue))}</strong></td>
      </tr></tbody>
    </table>

    <table class="cadre">
      <thead><tr>
        <th>#</th><th>N° de suivi</th><th>Expéditeur</th><th>Destinataire</th>
        <th class="droite">Pièces</th><th class="droite">Poids (kg)</th><th>Contenu</th><th class="droite">Valeur</th>
      </tr></thead>
      <tbody>${lignes || '<tr><td colspan="8" class="centre">Aucun colis chargé</td></tr>'}</tbody>
      <tfoot><tr style="border-top:2px solid #111;font-weight:bold;">
        <td colspan="4" class="droite">Totaux — ${colisList.length} expédition(s)</td>
        <td class="droite">${echapper(totalPieces)}</td>
        <td class="droite">${echapper(totalPoids.toFixed(2))}</td>
        <td></td>
        <td class="droite">${echapper(totalValeur.toFixed(2))}</td>
      </tr></tfoot>
    </table>

    <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:11px;">
      <div>Responsable du chargement<br><br>_______________________________</div>
      <div>Transporteur<br><br>_______________________________</div>
      <div>Visa douane<br><br>_______________________________</div>
    </div>`;

  return page(
    `Manifeste ${rotation.reference}`,
    contenu,
    '@page { size: A4 landscape; margin: 10mm; }'
  );
};

/* ── Bordereau de dépôt ─────────────────────────────────────────────────── */

/** Récépissé remis au client au moment du dépôt en point de collecte. */
const genererBordereauDepot = (colis, point, entreprise = {}) => {
  const contenu = `
    <div class="cadre" style="width:105mm;padding:10px;">
      <div style="text-align:center;border-bottom:1px solid #111;padding-bottom:6px;margin-bottom:8px;">
        <strong style="font-size:14px;">${echapper(entreprise.entreprise_nom || 'YOBNATE EXPRESS')}</strong><br>
        <span class="muted">Récépissé de dépôt</span>
      </div>
      <div class="centre">${barcode.versSvg(colis.reference, { moduleWidth: 1.6, hauteur: 48 })}</div>
      <table style="margin-top:8px;font-size:11px;">
        <tr><td class="muted">Déposé le</td><td>${echapper(dateHeureFr(new Date()))}</td></tr>
        <tr><td class="muted">Point</td><td>${echapper(point?.nom)} (${echapper(LIBELLES_TYPES_POINT[point?.type] || '')})</td></tr>
        <tr><td class="muted">Expéditeur</td><td>${echapper(colis.expediteurNom)}</td></tr>
        <tr><td class="muted">Destinataire</td><td>${echapper(colis.destinataireNom)}</td></tr>
        <tr><td class="muted">Destination</td><td>${echapper(colis.villeArrivee?.nom || '')} — ${echapper(PAYS[colis.paysArrivee]?.libelle)}</td></tr>
        <tr><td class="muted">Pièces / poids</td><td>${echapper(colis.nbPieces)} — ${echapper(Number(colis.poidsFactureKg))} kg</td></tr>
        <tr><td class="muted">Livraison estimée</td><td>${echapper(dateFr(colis.dateLivraisonEstimee))}</td></tr>
        <tr><td class="muted">Montant</td><td><strong>${echapper(formater(colis.montantTotal, colis.devise))}</strong></td></tr>
      </table>
      <div style="margin-top:10px;font-size:10px;color:#555;border-top:1px dashed #999;padding-top:6px;">
        Conservez ce récépissé. Le suivi est consultable à tout moment avec le numéro ci-dessus.
      </div>
    </div>`;

  return page(`Bordereau ${colis.reference}`, contenu, '@page { size: A6; margin: 4mm; }');
};

module.exports = {
  genererEtiquette,
  genererEtiquettes,
  genererFactureCommerciale,
  genererFactureTransport,
  genererManifeste,
  genererBordereauDepot,
  echapper,
  dateFr,
  dateHeureFr,
  page,
};
