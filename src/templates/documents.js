const barcode = require('../utils/barcode');
const { formater } = require('../utils/devise');
const { PAYS } = require('../config/pays');
const { LIBELLES_TYPES_POINT } = require('../config/reseau');

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

/**
 * Couleurs du pictogramme Yobante Colis (mêmes valeurs que l'application mobile,
 * lib/core/theme/app_color.dart) : bleu marine pour les bandeaux et les titres,
 * jaune pour les accents.
 */
const COULEURS = {
  primaire: '#053D8F',
  primaireClair: '#E7EDF6',
  secondaire: '#F6C537',
  secondaireClair: '#FEF6DD',
  fondClair: '#F5F7FB',
  ligne: '#E3E8F0',
  texte: '#1C1C1E',
  discret: '#616161',
  alerte: '#C62828',
};

/** Libellés lisibles des natures d'envoi (le code brut figurait sur les documents). */
const NATURES = {
  document: 'Document',
  marchandise: 'Marchandise',
  cadeau: 'Cadeau',
  echantillon: 'Échantillon',
  effets_personnels: 'Effets personnels',
  retour: 'Retour',
};
const nature = (code) => NATURES[code] || code || '—';
const libellePays = (code) => PAYS[code]?.libelle || code || '';

/**
 * Pictogramme de la marque dessiné en vectoriel : net à toutes les tailles,
 * imprimable sans fichier image à charger.
 */
const pictogramme = (taille = 32, { fond = false } = {}) => `
  <svg class="picto" width="${taille}" height="${Math.round(taille * 1.08)}" viewBox="-30 -30 547 585"
       xmlns="http://www.w3.org/2000/svg" aria-label="Yobante Colis" role="img">
    ${fond ? `<rect x="-30" y="-30" width="547" height="585" rx="90" fill="#ffffff"/>` : ''}
    <path d="M0 0 L160 0 A175 152 0 0 0 335 152 L335 318 A335 318 0 0 1 0 0 Z" fill="${COULEURS.primaire}"/>
    <rect x="333" y="0" width="154" height="152" fill="${COULEURS.secondaire}"/>
    <rect x="333" y="372" width="154" height="153" fill="${COULEURS.primaire}"/>
  </svg>`;

const STYLE_COMMUN = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12mm; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: ${COULEURS.texte}; font-size: 12px; line-height: 1.45;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1, h2, h3 { margin: 0; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; }
  th, td { padding: 7px 10px; text-align: left; vertical-align: top; }
  .droite { text-align: right; }
  .centre { text-align: center; }
  .muted { color: ${COULEURS.discret}; }
  .etiquette-champ { font-size: 9.5px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase;
    color: ${COULEURS.discret}; margin-bottom: 3px; }
  .fort { font-weight: 700; }

  /* En-tête des documents A4 : pictogramme, raison sociale, titre et références */
  .entete { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
    padding-bottom: 14px; border-bottom: 3px solid ${COULEURS.secondaire}; }
  .marque { display: flex; align-items: center; gap: 12px; }
  .marque-nom { font-size: 18px; font-weight: 800; color: ${COULEURS.primaire}; letter-spacing: .3px; }
  .marque-info { font-size: 10.5px; color: ${COULEURS.discret}; }
  .titre-doc { text-align: right; }
  .titre-doc h1 { font-size: 20px; color: ${COULEURS.primaire}; letter-spacing: .5px; }
  .titre-doc .sous-titre { font-size: 10.5px; color: ${COULEURS.discret}; margin-bottom: 6px; }
  .reference { display: inline-block; margin-top: 4px; padding: 4px 10px; border-radius: 6px;
    background: ${COULEURS.primaireClair}; color: ${COULEURS.primaire}; font-weight: 700; }

  /* Blocs d'informations */
  .grille { display: flex; gap: 12px; margin: 16px 0; }
  .bloc { flex: 1; border: 1px solid ${COULEURS.ligne}; border-radius: 10px; padding: 12px; background: #fff; }
  .bloc.accent { background: ${COULEURS.fondClair}; border-color: ${COULEURS.fondClair}; }
  .bloc .nom { font-size: 14px; font-weight: 700; margin-bottom: 2px; }

  /* Bande de chiffres clés */
  .chiffres { display: flex; border: 1px solid ${COULEURS.ligne}; border-radius: 10px; overflow: hidden; margin-bottom: 16px; }
  .chiffres > div { flex: 1; padding: 10px 12px; border-right: 1px solid ${COULEURS.ligne}; }
  .chiffres > div:last-child { border-right: 0; }
  .chiffres .valeur { font-size: 13px; font-weight: 700; color: ${COULEURS.primaire}; }

  /* Tableaux */
  .tableau { border: 1px solid ${COULEURS.ligne}; border-radius: 10px; overflow: hidden; }
  .tableau thead th { background: ${COULEURS.primaire}; color: #fff; font-size: 10px; font-weight: 700;
    letter-spacing: .5px; text-transform: uppercase; }
  .tableau tbody tr:nth-child(even) { background: ${COULEURS.fondClair}; }
  .tableau tbody td { border-top: 1px solid ${COULEURS.ligne}; }
  .tableau tfoot td { background: ${COULEURS.primaireClair}; font-weight: 700; color: ${COULEURS.primaire}; }
  .vide { padding: 18px; text-align: center; color: ${COULEURS.discret}; }

  /* Récapitulatif des montants */
  .totaux { width: 60%; margin: 16px 0 0 auto; border: 1px solid ${COULEURS.ligne}; border-radius: 10px; overflow: hidden; }
  .totaux td { padding: 7px 12px; }
  .totaux tr + tr td { border-top: 1px solid ${COULEURS.ligne}; }
  .totaux .total td { background: ${COULEURS.primaire}; color: #fff; font-size: 15px; font-weight: 800; }
  .totaux .solde td { background: ${COULEURS.secondaireClair}; color: ${COULEURS.primaire}; font-weight: 700; }

  .signatures { display: flex; gap: 24px; margin-top: 28px; }
  .signatures > div { flex: 1; font-size: 10.5px; color: ${COULEURS.discret}; }
  .signatures .ligne-signature { margin-top: 36px; border-top: 1px solid ${COULEURS.texte}; }

  .pied { margin-top: 24px; padding-top: 10px; border-top: 1px solid ${COULEURS.ligne};
    display: flex; justify-content: space-between; gap: 12px; font-size: 9.5px; color: ${COULEURS.discret}; }

  .code-barres svg { width: 100%; height: auto; display: block; }

  @media print { body { padding: 0; } .sans-impression { display: none; } }
`;

const page = (titre, contenu, styleSupplementaire = '') => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(titre)}</title>
<style>${STYLE_COMMUN}${styleSupplementaire}</style>
</head><body>${contenu}</body></html>`;

/** En-tête commun des documents A4. */
const entete = (entreprise, { titre, sousTitre, references = [] }) => `
  <div class="entete">
    <div class="marque">
      ${pictogramme(40)}
      <div>
        <div class="marque-nom">${echapper(entreprise.entreprise_nom || 'Yobante Colis')}</div>
        ${entreprise.entreprise_adresse ? `<div class="marque-info">${echapper(entreprise.entreprise_adresse)}</div>` : ''}
        <div class="marque-info">${[entreprise.entreprise_email, entreprise.entreprise_telephone]
          .filter(Boolean)
          .map(echapper)
          .join(' · ')}</div>
      </div>
    </div>
    <div class="titre-doc">
      <h1>${echapper(titre)}</h1>
      ${sousTitre ? `<div class="sous-titre">${echapper(sousTitre)}</div>` : ''}
      ${references.filter(Boolean).join('<br>')}
    </div>
  </div>`;

/** Pied de page commun : identité légale et date d'édition. */
const pied = (entreprise, mentions = '') => {
  const legal = [
    entreprise.entreprise_ninea ? `NINEA ${echapper(entreprise.entreprise_ninea)}` : '',
    entreprise.entreprise_siret ? `SIRET ${echapper(entreprise.entreprise_siret)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `
  <div class="pied">
    <div>${echapper(entreprise.entreprise_nom || 'Yobante Colis')}${legal ? ` · ${legal}` : ''}${
      mentions ? `<br>${echapper(mentions)}` : ''
    }</div>
    <div class="droite">Édité le ${echapper(dateHeureFr(new Date()))}</div>
  </div>`;
};

/* ── Étiquette d'expédition ─────────────────────────────────────────────── */

const STYLE_ETIQUETTE = `
  @page { size: A6; margin: 4mm; }
  body { padding: 4mm; }
  .etiquette { width: 100%; max-width: 105mm; margin: 0 auto; border: 1.5px solid ${COULEURS.texte};
    border-radius: 8px; overflow: hidden; background: #fff; }
  .et-entete { display: flex; align-items: center; justify-content: space-between; gap: 8px;
    background: ${COULEURS.primaire}; color: #fff; padding: 7px 10px; border-bottom: 3px solid ${COULEURS.secondaire}; }
  .et-marque { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 800; letter-spacing: .8px; }
  .et-service { background: ${COULEURS.secondaire}; color: ${COULEURS.primaire}; font-size: 9.5px; font-weight: 800;
    padding: 3px 8px; border-radius: 10px; text-transform: uppercase; letter-spacing: .4px; }
  .et-trajet { display: flex; align-items: center; padding: 8px 10px; border-bottom: 1px solid ${COULEURS.ligne}; gap: 8px; }
  .et-trajet .pays { font-size: 22px; font-weight: 800; color: ${COULEURS.primaire}; letter-spacing: 1px; line-height: 1; }
  .et-trajet .ville { font-size: 9.5px; color: ${COULEURS.discret}; }
  .et-trajet .fleche { flex: 1; height: 2px; background: ${COULEURS.ligne}; position: relative; }
  .et-trajet .fleche::after { content: ''; position: absolute; right: -1px; top: -4px; border: 5px solid transparent;
    border-left: 7px solid ${COULEURS.secondaire}; }
  .et-partie { padding: 7px 10px; border-bottom: 1px solid ${COULEURS.ligne}; }
  .et-partie.dest { background: ${COULEURS.fondClair}; }
  .et-partie .nom { font-size: 12px; font-weight: 700; }
  .et-partie.dest .nom { font-size: 15px; }
  .et-chiffres { display: flex; border-bottom: 1px solid ${COULEURS.ligne}; text-align: center; }
  .et-chiffres > div { flex: 1; padding: 6px 4px; border-right: 1px solid ${COULEURS.ligne}; }
  .et-chiffres > div:last-child { border-right: 0; }
  .et-chiffres .valeur { font-size: 13px; font-weight: 800; }
  .et-alerte { padding: 5px 10px; background: ${COULEURS.alerte}; color: #fff; font-size: 10px; font-weight: 800;
    letter-spacing: .6px; text-align: center; }
  .et-code { padding: 8px 10px 4px; }
  .et-numero { text-align: center; font-family: "Courier New", monospace; font-size: 13px; font-weight: 700;
    letter-spacing: 1.5px; padding-bottom: 6px; }
  .et-pied { display: flex; justify-content: space-between; padding: 5px 10px; background: ${COULEURS.primaireClair};
    font-size: 9.5px; color: ${COULEURS.primaire}; font-weight: 700; }
`;

/**
 * Étiquette à coller sur le colis : numéro de suivi en code-barres, corridor,
 * coordonnées des deux parties, gabarit et point de retrait.
 * Une étiquette est produite par pièce dans une expédition multi-colis.
 */
const corpsEtiquette = (colis, { piece = null, point = null } = {}) => {
  const numero = piece?.numeroSuivi || colis.reference;
  const rang = piece ? `${piece.ordre} / ${colis.nbPieces}` : `1 / ${colis.nbPieces}`;
  const poids = Number(piece?.poidsKg ?? colis.poidsFactureKg);
  const alertes = [
    colis.fragile ? '&#9888; FRAGILE — MANIPULER AVEC PRÉCAUTION' : '',
    colis.marchandiseDangereuse ? '&#9888; MARCHANDISE RÉGLEMENTÉE' : '',
  ].filter(Boolean);

  return `
  <div class="etiquette">
    <div class="et-entete">
      <div class="et-marque">${pictogramme(20, { fond: true })} YOBANTE COLIS</div>
      ${colis.service?.nom ? `<div class="et-service">${echapper(colis.service.nom)}</div>` : ''}
    </div>

    <div class="et-trajet">
      <div>
        <div class="pays">${echapper(colis.paysDepart)}</div>
        <div class="ville">${echapper(colis.villeDepart?.nom || '')}</div>
      </div>
      <div class="fleche"></div>
      <div class="droite">
        <div class="pays">${echapper(colis.paysArrivee)}</div>
        <div class="ville">${echapper(colis.villeArrivee?.nom || '')}</div>
      </div>
    </div>

    <div class="et-partie dest">
      <div class="etiquette-champ">Destinataire</div>
      <div class="nom">${echapper(colis.destinataireNom)}</div>
      ${colis.destinataireEntreprise ? `<div>${echapper(colis.destinataireEntreprise)}</div>` : ''}
      ${colis.adresseLivraison ? `<div>${echapper(colis.adresseLivraison)}</div>` : ''}
      <div class="fort">${echapper(colis.villeArrivee?.nom || '')} ${echapper(colis.codePostalArrivee || '')} — ${echapper(
        libellePays(colis.paysArrivee)
      )}</div>
      <div>Tél. ${echapper(colis.destinataireTelephone)}</div>
    </div>

    ${
      point
        ? `<div class="et-partie">
      <div class="etiquette-champ">Point de retrait</div>
      <div class="fort">${echapper(point.nom)} <span class="muted">· ${echapper(point.code)}</span></div>
      <div>${echapper(point.adresse)}</div>
    </div>`
        : ''
    }

    <div class="et-partie">
      <div class="etiquette-champ">Expéditeur</div>
      <div class="nom">${echapper(colis.expediteurNom)}</div>
      ${colis.expediteurEntreprise ? `<div>${echapper(colis.expediteurEntreprise)}</div>` : ''}
      <div>${[colis.adresseDepart, colis.villeDepart?.nom, libellePays(colis.paysDepart)]
        .filter(Boolean)
        .map(echapper)
        .join(', ')}</div>
      <div>${echapper(colis.expediteurTelephone)}</div>
    </div>

    <div class="et-chiffres">
      <div><div class="etiquette-champ">Pièce</div><div class="valeur">${echapper(rang)}</div></div>
      <div><div class="etiquette-champ">Poids</div><div class="valeur">${echapper(poids)} kg</div></div>
      <div><div class="etiquette-champ">Contenu</div><div class="valeur">${echapper(nature(colis.typeContenu))}</div></div>
    </div>

    ${alertes.map((a) => `<div class="et-alerte">${a}</div>`).join('')}

    <div class="et-code">
      <div class="code-barres">${barcode.versSvg(numero, { moduleWidth: 2, hauteur: 70, afficherTexte: false, marge: 6 })}</div>
    </div>
    <div class="et-numero">${echapper(numero)}</div>

    <div class="et-pied">
      <span>${echapper(libellePays(colis.paysDepart))} &#8594; ${echapper(libellePays(colis.paysArrivee))}</span>
      <span>Livraison estimée : ${echapper(dateFr(colis.dateLivraisonEstimee))}</span>
    </div>
  </div>`;
};

const genererEtiquette = (colis, options = {}) => {
  const numero = options.piece?.numeroSuivi || colis.reference;
  return page(`Étiquette ${numero}`, corpsEtiquette(colis, options), STYLE_ETIQUETTE);
};

/** Planche regroupant les étiquettes de toutes les pièces d'une expédition. */
const genererEtiquettes = (colis, pieces = [], point = null) => {
  const liste = pieces.length ? pieces : [null];
  const corps = liste
    .map((piece) => corpsEtiquette(colis, { piece, point }))
    .join('<div style="page-break-after:always;"></div>');
  return page(`Étiquettes ${colis.reference}`, corps, STYLE_ETIQUETTE);
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
  const totalDeclare =
    Number(totalArticles) +
    Number(declaration.fraisTransport || 0) +
    Number(declaration.fraisAssurance || 0);

  const lignes = articles
    .map(
      (a, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><span class="fort">${echapper(a.designation)}</span>${a.marque ? `<br><span class="muted">${echapper(a.marque)}</span>` : ''}</td>
      <td>${echapper(a.codeSh || '—')}</td>
      <td>${echapper(a.paysOrigine || '—')}</td>
      <td class="droite">${echapper(Number(a.quantite))} ${echapper(a.unite)}</td>
      <td class="droite">${echapper(formater(a.valeurUnitaire, devise))}</td>
      <td class="droite fort">${echapper(formater(Number(a.quantite) * Number(a.valeurUnitaire), devise))}</td>
    </tr>`
    )
    .join('');

  const contenu = `
    ${entete(entreprise, {
      titre: 'FACTURE COMMERCIALE',
      sousTitre: 'Commercial invoice — pour usage douanier',
      references: [
        `<span class="reference">N° ${echapper(declaration.factureCommercialeNumero || declaration.id)}</span>`,
        `<span class="muted">Date : ${echapper(dateFr(declaration.createdAt || new Date()))}</span>`,
        `<span class="muted">LTA : <strong>${echapper(colis.reference)}</strong></span>`,
      ],
    })}

    <div class="grille">
      <div class="bloc">
        <div class="etiquette-champ">Expéditeur / Exportateur</div>
        <div class="nom">${echapper(colis.expediteurNom)}</div>
        ${colis.expediteurEntreprise ? `<div>${echapper(colis.expediteurEntreprise)}</div>` : ''}
        ${colis.adresseDepart ? `<div>${echapper(colis.adresseDepart)}</div>` : ''}
        <div>${echapper(colis.villeDepart?.nom || '')} — ${echapper(libellePays(colis.paysDepart))}</div>
        <div>Tél. ${echapper(colis.expediteurTelephone)}</div>
        ${declaration.numeroEori ? `<div>EORI : ${echapper(declaration.numeroEori)}</div>` : ''}
        ${declaration.numeroNinea ? `<div>NINEA : ${echapper(declaration.numeroNinea)}</div>` : ''}
      </div>
      <div class="bloc accent">
        <div class="etiquette-champ">Destinataire / Importateur</div>
        <div class="nom">${echapper(colis.destinataireNom)}</div>
        ${colis.destinataireEntreprise ? `<div>${echapper(colis.destinataireEntreprise)}</div>` : ''}
        ${colis.adresseLivraison ? `<div>${echapper(colis.adresseLivraison)}</div>` : ''}
        <div>${echapper(colis.villeArrivee?.nom || '')} ${echapper(colis.codePostalArrivee || '')} — ${echapper(
          libellePays(colis.paysArrivee)
        )}</div>
        <div>Tél. ${echapper(colis.destinataireTelephone)}</div>
      </div>
    </div>

    <div class="chiffres">
      <div><div class="etiquette-champ">Motif de l'exportation</div><div class="valeur">${echapper(nature(declaration.motifExport))}</div></div>
      <div><div class="etiquette-champ">Incoterm</div><div class="valeur">${echapper(declaration.incoterm)}</div></div>
      <div><div class="etiquette-champ">Poids brut</div><div class="valeur">${echapper(Number(declaration.poidsBrutKg || colis.poidsReelKg))} kg</div></div>
      <div><div class="etiquette-champ">Nombre de pièces</div><div class="valeur">${echapper(colis.nbPieces)}</div></div>
    </div>

    <div class="tableau">
      <table>
        <thead><tr>
          <th>#</th><th>Désignation des marchandises</th><th>Code SH</th><th>Origine</th>
          <th class="droite">Quantité</th><th class="droite">Prix unitaire</th><th class="droite">Montant</th>
        </tr></thead>
        <tbody>${lignes || '<tr><td colspan="7" class="vide">Aucun article déclaré</td></tr>'}</tbody>
      </table>
    </div>

    <table class="totaux">
      <tr><td>Valeur des marchandises</td><td class="droite">${echapper(formater(totalArticles, devise))}</td></tr>
      <tr><td>Frais de transport</td><td class="droite">${echapper(formater(declaration.fraisTransport, devise))}</td></tr>
      <tr><td>Assurance</td><td class="droite">${echapper(formater(declaration.fraisAssurance, devise))}</td></tr>
      <tr class="total"><td>Valeur totale déclarée</td><td class="droite">${echapper(formater(totalDeclare, devise))}</td></tr>
    </table>

    <p style="margin-top:20px;font-size:11px;">Je certifie que les renseignements portés sur cette facture sont exacts
    et que le contenu de cet envoi est conforme à la description ci-dessus.</p>
    <div class="signatures">
      <div>Nom et signature de l'expéditeur<div class="ligne-signature"></div></div>
      <div>Date<div style="margin-top:20px;color:${COULEURS.texte};font-weight:700;">${echapper(dateFr(new Date()))}</div></div>
    </div>

    ${pied(entreprise)}`;

  return page(
    `Facture commerciale ${colis.reference}`,
    contenu,
    '@page { size: A4; margin: 12mm; }'
  );
};

/* ── Facture de transport ───────────────────────────────────────────────── */

/** Facture de la prestation de transport, remise au payeur. */
const genererFactureTransport = (facture, colis, entreprise = {}) => {
  const devise = facture.devise;
  const lignes = (facture.lignes || [])
    .map(
      (l) => `
    <tr><td>${echapper(l.libelle)}</td><td class="droite fort">${echapper(formater(l.montant, devise))}</td></tr>`
    )
    .join('');
  const client =
    facture.User?.nomComplet || `${facture.User?.prenom || ''} ${facture.User?.nom || ''}`.trim();
  const solde = Number(facture.montantTotal) - Number(facture.montantPaye);

  const contenu = `
    ${entete(entreprise, {
      titre: 'FACTURE',
      references: [
        `<span class="reference">${echapper(facture.reference)}</span>`,
        `<span class="muted">Émise le ${echapper(dateFr(facture.dateEmission))}</span>`,
        facture.dateLimitePaiement
          ? `<span class="muted">Échéance : <strong>${echapper(dateFr(facture.dateLimitePaiement))}</strong></span>`
          : '',
      ],
    })}

    <div class="grille">
      <div class="bloc accent">
        <div class="etiquette-champ">Facturé à</div>
        <div class="nom">${echapper(client)}</div>
        ${facture.User?.raisonSociale ? `<div>${echapper(facture.User.raisonSociale)}</div>` : ''}
        ${facture.User?.email ? `<div>${echapper(facture.User.email)}</div>` : ''}
      </div>
      ${
        colis
          ? `<div class="bloc">
        <div class="etiquette-champ">Expédition</div>
        <div class="nom">${echapper(colis.reference)}</div>
        <div>${echapper(colis.villeDepart?.nom || '')} &#8594; ${echapper(colis.villeArrivee?.nom || '')}</div>
        <div class="muted">${echapper(Number(colis.poidsFactureKg))} kg · ${echapper(colis.nbPieces)} pièce(s)</div>
      </div>`
          : ''
      }
    </div>

    <div class="tableau">
      <table>
        <thead><tr><th>Désignation</th><th class="droite">Montant</th></tr></thead>
        <tbody>${lignes || `<tr><td>Prestation de transport</td><td class="droite fort">${echapper(formater(facture.montantFret, devise))}</td></tr>`}</tbody>
      </table>
    </div>

    <table class="totaux">
      <tr><td>Total hors taxes</td><td class="droite">${echapper(formater(facture.montantHt, devise))}</td></tr>
      ${Number(facture.remise) > 0 ? `<tr><td>Remise</td><td class="droite">- ${echapper(formater(facture.remise, devise))}</td></tr>` : ''}
      <tr><td>TVA (${echapper(Number(facture.tauxTva))} %)</td><td class="droite">${echapper(formater(facture.montantTva, devise))}</td></tr>
      ${Number(facture.montantDroitsDouane) > 0 ? `<tr><td>Droits et taxes à l'import</td><td class="droite">${echapper(formater(facture.montantDroitsDouane, devise))}</td></tr>` : ''}
      <tr class="total"><td>Total à régler</td><td class="droite">${echapper(formater(facture.montantTotal, devise))}</td></tr>
      ${
        Number(facture.montantPaye) > 0
          ? `<tr><td>Déjà réglé</td><td class="droite">${echapper(formater(facture.montantPaye, devise))}</td></tr>
      <tr class="solde"><td>Solde dû</td><td class="droite">${echapper(formater(solde, devise))}</td></tr>`
          : ''
      }
    </table>

    ${pied(entreprise, facture.mentions || entreprise.mentions_facture || '')}`;

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
      <td class="fort">${echapper(c.reference)}</td>
      <td>${echapper(c.expediteurNom)}</td>
      <td>${echapper(c.destinataireNom)}<br><span class="muted">${echapper(c.villeArrivee?.nom || '')}</span></td>
      <td class="droite">${echapper(c.nbPieces)}</td>
      <td class="droite">${echapper(Number(c.poidsFactureKg))}</td>
      <td>${echapper(nature(c.typeContenu))}</td>
      <td class="droite">${echapper(Number(c.valeurDeclaree))}</td>
    </tr>`
    )
    .join('');

  const contenu = `
    ${entete(entreprise, {
      titre: 'MANIFESTE DE CHARGEMENT',
      references: [
        `<span class="reference">${echapper(rotation.numeroManifeste || rotation.reference)}</span>`,
        `<span class="muted">Rotation ${echapper(rotation.reference)}</span>`,
      ],
    })}

    <div class="chiffres" style="margin-top:16px;">
      <div><div class="etiquette-champ">Corridor</div><div class="valeur">${echapper(libellePays(rotation.paysDepart))} &#8594; ${echapper(libellePays(rotation.paysArrivee))}</div></div>
      <div><div class="etiquette-champ">Mode</div><div class="valeur">${echapper(rotation.modeTransport)}</div></div>
      <div><div class="etiquette-champ">Transporteur</div><div class="valeur">${echapper(rotation.transporteur || '—')}</div></div>
      <div><div class="etiquette-champ">Vol / conteneur</div><div class="valeur">${echapper(rotation.numeroVol || rotation.numeroConteneur || '—')}</div></div>
      <div><div class="etiquette-champ">Départ prévu</div><div class="valeur">${echapper(dateHeureFr(rotation.dateDepartPrevue))}</div></div>
      <div><div class="etiquette-champ">Arrivée prévue</div><div class="valeur">${echapper(dateHeureFr(rotation.dateArriveePrevue))}</div></div>
    </div>

    <div class="tableau">
      <table>
        <thead><tr>
          <th>#</th><th>N° de suivi</th><th>Expéditeur</th><th>Destinataire</th>
          <th class="droite">Pièces</th><th class="droite">Poids (kg)</th><th>Contenu</th><th class="droite">Valeur</th>
        </tr></thead>
        <tbody>${lignes || '<tr><td colspan="8" class="vide">Aucun colis chargé</td></tr>'}</tbody>
        <tfoot><tr>
          <td colspan="4" class="droite">Totaux — ${colisList.length} expédition(s)</td>
          <td class="droite">${echapper(totalPieces)}</td>
          <td class="droite">${echapper(totalPoids.toFixed(2))}</td>
          <td></td>
          <td class="droite">${echapper(totalValeur.toFixed(2))}</td>
        </tr></tfoot>
      </table>
    </div>

    <div class="signatures">
      <div>Responsable du chargement<div class="ligne-signature"></div></div>
      <div>Transporteur<div class="ligne-signature"></div></div>
      <div>Visa douane<div class="ligne-signature"></div></div>
    </div>

    ${pied(entreprise)}`;

  return page(
    `Manifeste ${rotation.reference}`,
    contenu,
    '@page { size: A4 landscape; margin: 10mm; }'
  );
};

/* ── Bordereau de dépôt ─────────────────────────────────────────────────── */

const STYLE_BORDEREAU = `
  @page { size: A6; margin: 4mm; }
  body { padding: 4mm; }
  .recu { width: 100%; max-width: 105mm; margin: 0 auto; border: 1px solid ${COULEURS.ligne}; border-radius: 10px;
    overflow: hidden; background: #fff; }
  .recu-entete { background: ${COULEURS.primaire}; color: #fff; padding: 10px 12px; border-bottom: 3px solid ${COULEURS.secondaire};
    display: flex; align-items: center; gap: 10px; }
  .recu-entete .nom { font-size: 13px; font-weight: 800; letter-spacing: .5px; }
  .recu-entete .type { font-size: 10px; opacity: .85; }
  .recu-corps { padding: 10px 12px; }
  .recu-corps .numero { text-align: center; font-family: "Courier New", monospace; font-size: 12px; font-weight: 700;
    letter-spacing: 1.2px; margin: 2px 0 8px; }
  .recu-lignes td { padding: 4px 0; border-bottom: 1px dashed ${COULEURS.ligne}; font-size: 11px; }
  .recu-lignes td:first-child { color: ${COULEURS.discret}; width: 42%; }
  .recu-montant { display: flex; justify-content: space-between; align-items: center; margin-top: 10px;
    padding: 8px 10px; border-radius: 8px; background: ${COULEURS.primaireClair}; color: ${COULEURS.primaire}; }
  .recu-montant strong { font-size: 15px; }
  .recu-note { margin-top: 10px; font-size: 9.5px; color: ${COULEURS.discret}; text-align: center; }
`;

/** Récépissé remis au client au moment du dépôt en point de collecte. */
const genererBordereauDepot = (colis, point, entreprise = {}) => {
  const typePoint = LIBELLES_TYPES_POINT[point?.type] || '';
  const contenu = `
    <div class="recu">
      <div class="recu-entete">
        ${pictogramme(26, { fond: true })}
        <div>
          <div class="nom">${echapper(entreprise.entreprise_nom || 'YOBANTE COLIS')}</div>
          <div class="type">Récépissé de dépôt</div>
        </div>
      </div>
      <div class="recu-corps">
        <div class="code-barres">${barcode.versSvg(colis.reference, { moduleWidth: 1.6, hauteur: 52, afficherTexte: false, marge: 4 })}</div>
        <div class="numero">${echapper(colis.reference)}</div>
        <table class="recu-lignes">
          <tr><td>Déposé le</td><td>${echapper(dateHeureFr(new Date()))}</td></tr>
          <tr><td>Point</td><td>${echapper(point?.nom)}${typePoint ? ` (${echapper(typePoint)})` : ''}</td></tr>
          <tr><td>Expéditeur</td><td class="fort">${echapper(colis.expediteurNom)}</td></tr>
          <tr><td>Destinataire</td><td class="fort">${echapper(colis.destinataireNom)}</td></tr>
          <tr><td>Destination</td><td>${echapper(colis.villeArrivee?.nom || '')} — ${echapper(libellePays(colis.paysArrivee))}</td></tr>
          <tr><td>Pièces / poids</td><td>${echapper(colis.nbPieces)} · ${echapper(Number(colis.poidsFactureKg))} kg</td></tr>
          <tr><td>Livraison estimée</td><td>${echapper(dateFr(colis.dateLivraisonEstimee))}</td></tr>
        </table>
        <div class="recu-montant"><span>Montant</span><strong>${echapper(formater(colis.montantTotal, colis.devise))}</strong></div>
        <div class="recu-note">Conservez ce récépissé. Le suivi est consultable à tout moment avec le numéro ci-dessus.</div>
      </div>
    </div>`;

  return page(`Bordereau ${colis.reference}`, contenu, STYLE_BORDEREAU);
};

/* ── Inventaire d'un chargement ─────────────────────────────────────────── */

/**
 * Liste imprimable de tous les produits chargés (par conteneur ou par tournée) :
 * synthèse par produit et par état, puis détail colis par colis.
 */
const genererInventaire = (inventaire, entreprise = {}) => {
  const synthese = inventaire.synthese
    .map(
      (s) => `
    <tr>
      <td class="fort">${echapper(s.produit)}</td>
      <td>${echapper(s.etat)}</td>
      <td class="droite fort">${echapper(s.quantite)}</td>
      <td class="droite">${echapper(s.colis)}</td>
    </tr>`
    )
    .join('');

  const detail = inventaire.lignes
    .map(
      (l) => `
    <tr>
      <td class="fort">${echapper(l.reference)}</td>
      <td>${echapper(l.produit)}</td>
      <td class="droite">${echapper(l.quantite)}</td>
      <td>${echapper(l.etat)}</td>
      <td>${echapper(l.expediteur)}</td>
      <td>${echapper(l.destinataire)}<br><span class="muted">${echapper(l.villeArrivee)}</span></td>
    </tr>`
    )
    .join('');

  const contenu = `
    ${entete(entreprise, {
      titre: 'INVENTAIRE DES PRODUITS CHARGÉS',
      references: [`<span class="reference">${echapper(inventaire.titre)}</span>`],
    })}

    <div class="chiffres" style="margin-top:16px;">
      <div><div class="etiquette-champ">Colis</div><div class="valeur">${echapper(inventaire.nbColis)}</div></div>
      <div><div class="etiquette-champ">Articles</div><div class="valeur">${echapper(inventaire.quantiteTotale)}</div></div>
      <div><div class="etiquette-champ">Produits distincts</div><div class="valeur">${echapper(inventaire.synthese.length)}</div></div>
    </div>

    <h2 style="font-size:14px;color:${COULEURS.primaire};margin:4px 0 8px;">Synthèse par produit</h2>
    <div class="tableau">
      <table>
        <thead><tr><th>Produit</th><th>État</th><th class="droite">Quantité</th><th class="droite">Colis</th></tr></thead>
        <tbody>${synthese || '<tr><td colspan="4" class="vide">Aucun produit</td></tr>'}</tbody>
      </table>
    </div>

    <h2 style="font-size:14px;color:${COULEURS.primaire};margin:18px 0 8px;">Détail par colis</h2>
    <div class="tableau">
      <table>
        <thead><tr><th>N° de suivi</th><th>Produit</th><th class="droite">Qté</th><th>État</th><th>Expéditeur</th><th>Destinataire</th></tr></thead>
        <tbody>${detail || '<tr><td colspan="6" class="vide">Aucun colis</td></tr>'}</tbody>
      </table>
    </div>

    ${pied(entreprise)}`;

  return page(`Inventaire — ${inventaire.titre}`, contenu, '@page { size: A4; margin: 12mm; }');
};

module.exports = {
  genererEtiquette,
  genererEtiquettes,
  genererFactureCommerciale,
  genererFactureTransport,
  genererManifeste,
  genererBordereauDepot,
  genererInventaire,
  echapper,
  dateFr,
  dateHeureFr,
  page,
};
