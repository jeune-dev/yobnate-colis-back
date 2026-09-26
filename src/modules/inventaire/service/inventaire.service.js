const {
  Colis,
  Rotation,
  TourneeCollecte,
  DeclarationDouane,
  ArticleDouane,
  Ville,
} = require('../../../models');
const { BadRequestError, NotFoundError } = require('../../../errors/AppError');
const { versCsv } = require('../../../utils/csv');
const documents = require('../../../templates/documents');
const parametreService = require('../../parametre/service/parametre.service');

/**
 * Inventaire des produits chargés.
 *
 * Liste imprimable de tous les produits d'un chargement (conteneur) ou d'une
 * tournée de collecte, avec leur quantité et leur état (neuf ou d'occasion),
 * ainsi qu'une synthèse par produit. Les produits sont lus, par ordre de
 * précision : dans les lignes de la déclaration douanière, puis dans les
 * articles de la grille forfaitaire, et à défaut dans la description du colis.
 */
class InventaireService {
  static chargerPerimetre = async ({ rotationId, tourneeCollecteId }) => {
    if (!rotationId && !tourneeCollecteId) {
      throw new BadRequestError('Précisez un conteneur (rotationId) ou une tournée de collecte');
    }
    const where = {};
    let titre;
    if (rotationId) {
      const rotation = await Rotation.findByPk(rotationId);
      if (!rotation) throw new NotFoundError('Conteneur introuvable');
      where.rotationId = rotationId;
      titre = `Conteneur n° ${String(rotation.numeroOrdre || '').padStart(2, '0')} — ${rotation.reference}`;
    }
    if (tourneeCollecteId) {
      const tournee = await TourneeCollecte.findByPk(tourneeCollecteId);
      if (!tournee) throw new NotFoundError('Tournée de collecte introuvable');
      where.tourneeCollecteId = tourneeCollecteId;
      titre = `${titre ? `${titre} · ` : ''}Tournée ${tournee.reference} du ${tournee.dateCollecte}`;
    }
    return { where, titre };
  };

  /** Une ligne par produit et par colis. */
  static lignesDuColis = (colis) => {
    const commun = {
      reference: colis.reference,
      categorie: colis.categorie,
      expediteur: colis.expediteurNom,
      destinataire: colis.destinataireNom,
      villeArrivee: colis.villeArrivee?.nom || '',
    };
    const articles = colis.declarationDouane?.articles || [];
    if (articles.length) {
      return articles.map((a) => ({
        ...commun,
        produit: a.designation,
        quantite: Number(a.quantite),
        etat: a.etat || colis.etatMarchandise || 'non précisé',
      }));
    }
    if (colis.lignesForfait?.length) {
      return colis.lignesForfait.map((l) => ({
        ...commun,
        produit: l.libelle,
        quantite: Number(l.quantite || 1),
        etat: colis.etatMarchandise || 'non précisé',
      }));
    }
    return [
      {
        ...commun,
        produit: colis.description || colis.typeDocument || 'Contenu non décrit',
        quantite: Number(colis.nbPieces || 1),
        etat: colis.etatMarchandise || 'non précisé',
      },
    ];
  };

  static getInventaire = async (filtres = {}) => {
    const { where, titre } = await InventaireService.chargerPerimetre(filtres);
    const colis = await Colis.findAll({
      where,
      include: [
        { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom'] },
        {
          model: DeclarationDouane,
          as: 'declarationDouane',
          attributes: ['id'],
          include: [{ model: ArticleDouane, as: 'articles' }],
        },
      ],
      order: [['reference', 'ASC']],
    });

    const lignes = colis.flatMap(InventaireService.lignesDuColis);

    // Synthèse : quantité totale par produit et par état
    const synthese = Object.values(
      lignes.reduce((acc, l) => {
        const cle = `${l.produit.trim().toLowerCase()}|${l.etat}`;
        if (!acc[cle])
          acc[cle] = { produit: l.produit.trim(), etat: l.etat, quantite: 0, colis: 0 };
        acc[cle].quantite += l.quantite;
        acc[cle].colis += 1;
        return acc;
      }, {})
    ).sort((a, b) => a.produit.localeCompare(b.produit, 'fr'));

    return {
      message: `Inventaire : ${lignes.length} ligne(s) sur ${colis.length} colis`,
      inventaire: {
        titre,
        nbColis: colis.length,
        quantiteTotale: lignes.reduce((a, l) => a + l.quantite, 0),
        lignes,
        synthese,
      },
    };
  };

  static COLONNES_CSV = [
    { cle: 'reference', libelle: 'N° de suivi' },
    { cle: 'categorie', libelle: 'Catégorie' },
    { cle: 'produit', libelle: 'Produit' },
    { cle: 'quantite', libelle: 'Quantité' },
    { cle: 'etat', libelle: 'État' },
    { cle: 'expediteur', libelle: 'Expéditeur' },
    { cle: 'destinataire', libelle: 'Destinataire' },
    { cle: 'villeArrivee', libelle: 'Ville de destination' },
  ];

  static exporterCsv = async (filtres) => {
    const { inventaire } = await InventaireService.getInventaire(filtres);
    return {
      contenu: versCsv(inventaire.lignes, InventaireService.COLONNES_CSV),
      nomFichier: `inventaire-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  };

  static getDocument = async (filtres) => {
    const [{ inventaire }, parametres] = await Promise.all([
      InventaireService.getInventaire(filtres),
      parametreService.chargerTous(),
    ]);
    return {
      html: documents.genererInventaire(inventaire, parametres),
      nomFichier: `inventaire-${new Date().toISOString().slice(0, 10)}.html`,
    };
  };
}

module.exports = InventaireService;
