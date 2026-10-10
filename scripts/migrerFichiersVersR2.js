/* eslint-disable no-console -- script en ligne de commande : la sortie standard est son interface */
/**
 * Transfère vers Cloudflare R2 les fichiers enregistrés avant la bascule
 * (anciennes URL Cloudinary, ou fichiers locaux d'un poste de développement),
 * puis remplace leur URL et leur identifiant en base.
 *
 * Tous les champs de fichiers sont couverts : photos et vocaux des colis,
 * avatars et justificatifs des comptes, points de collecte, grille tarifaire,
 * emballages, annonces, preuves de livraison, documents de douane, pièces
 * jointes des réclamations.
 *
 * - Sans option : simulation, rien n'est modifié (liste ce qui serait transféré).
 * - --appliquer   : transfère et met à jour la base.
 * Relançable sans risque : un fichier déjà sur R2 (identifiant « r2: ») est ignoré,
 * un échec laisse l'ancienne URL en place et sera retenté au passage suivant.
 * Les originaux ne sont pas supprimés : fermer l'ancien compte une fois le
 * transfert vérifié.
 *
 * Usage : npm run fichiers:migrer-r2 [-- --appliquer]
 */
require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { Op } = require('sequelize');
const models = require('../src/models');
const { uploadFile, estConfigure } = require('../src/infrastructure/r2.service');

const { sequelize } = models;
const PREFIXE_R2 = 'r2:';
const PREFIXE_LOCAL = 'local:';
const DOSSIER_LOCAL = path.resolve(__dirname, '../uploads');
const DOSSIER_PAR_DEFAUT = 'yobante-colis/migration';
const DELAI_TELECHARGEMENT_MS = 30000;

/** Colonnes simples : une URL et son identifiant sur la même ligne. */
const CHAMPS = [
  ['User', 'avatarUrl', 'avatarPublicId', 'yobante-colis/avatars'],
  ['User', 'justificatifProUrl', 'justificatifProPublicId', 'yobante-colis/justificatifs'],
  ['PointCollecte', 'photoUrl', 'photoPublicId', 'yobante-colis/points'],
  ['ArticleTarif', 'photoUrl', 'photoPublicId', 'yobante-colis/grille'],
  ['Annonce', 'imageUrl', 'imagePublicId', 'yobante-colis/annonces'],
  ['Colis', 'vocalUrl', 'vocalPublicId', 'yobante-colis/vocaux'],
  ['ColisPiece', 'photoUrl', 'photoPublicId', 'yobante-colis/colis'],
  ['PreuveLivraison', 'signatureUrl', 'signaturePublicId', 'yobante-colis/livraisons'],
  ['PreuveLivraison', 'photoUrl', 'photoPublicId', 'yobante-colis/livraisons'],
];

/** Colonnes JSON : liste d'objets { url, publicId, … }. */
const LISTES = [
  ['Colis', 'photos', 'yobante-colis/colis'],
  ['Emballage', 'photos', 'yobante-colis/emballages'],
  ['DeclarationDouane', 'documents', 'yobante-colis/douane'],
  ['Reclamation', 'piecesJointes', 'yobante-colis/reclamations'],
  ['MessageReclamation', 'piecesJointes', 'yobante-colis/reclamations'],
];

const aTransferer = (url, publicId) =>
  Boolean(url) && !String(publicId || '').startsWith(PREFIXE_R2);

/** Anciennes racines (avant le nom Yobante Colis), rangées sous la racine actuelle. */
const ANCIENNES_RACINES = /^(yobnate-express|yobnate-colis)(\/|$)/;

/** Dossier d'origine (« yobnate-express/avatars/abc » → « yobante-colis/avatars »). */
const dossierDe = (publicId, dossierParDefaut) => {
  const chemin = String(publicId || '')
    .replace(PREFIXE_LOCAL, '')
    .replace(ANCIENNES_RACINES, 'yobante-colis$2');
  const dossier = path.posix.dirname(chemin);
  return dossier && dossier !== '.' ? dossier : dossierParDefaut || DOSSIER_PAR_DEFAUT;
};

/** Contenu de l'ancien fichier : sur le disque (poste de développement) ou par HTTP. */
const lireAncien = async (url, publicId) => {
  if (String(publicId || '').startsWith(PREFIXE_LOCAL)) {
    const relatif = path.normalize(publicId.slice(PREFIXE_LOCAL.length));
    if (relatif.startsWith('..')) throw new Error('chemin local invalide');
    return fs.readFile(path.join(DOSSIER_LOCAL, relatif));
  }
  const reponse = await fetch(url, { signal: AbortSignal.timeout(DELAI_TELECHARGEMENT_MS) });
  if (!reponse.ok) throw new Error(`téléchargement refusé (HTTP ${reponse.status})`);
  return Buffer.from(await reponse.arrayBuffer());
};

const migrer = async ({ appliquer = false, journal = console.log } = {}) => {
  if (appliquer && !estConfigure()) {
    throw new Error(
      'Cloudflare R2 non configuré : renseigner les variables R2_* avant --appliquer'
    );
  }
  const bilan = { transferes: 0, aTransferer: 0, deja: 0, echecs: [] };
  // Une même ancienne URL (fichier partagé) n'est transférée qu'une fois
  const dejaTransferes = new Map();

  const transferer = async (url, publicId, dossierParDefaut, lieu) => {
    if (!aTransferer(url, publicId)) {
      if (url) bilan.deja += 1;
      return null;
    }
    bilan.aTransferer += 1;
    if (!appliquer) {
      journal(`  à transférer  ${lieu} : ${url}`);
      return null;
    }
    try {
      if (!dejaTransferes.has(url)) {
        const contenu = await lireAncien(url, publicId);
        dejaTransferes.set(
          url,
          await uploadFile(contenu, { folder: dossierDe(publicId, dossierParDefaut) })
        );
      }
      bilan.transferes += 1;
      return dejaTransferes.get(url);
    } catch (err) {
      bilan.echecs.push({ lieu, url, raison: err.message });
      return null;
    }
  };

  for (const [modele, champUrl, champId, dossier] of CHAMPS) {
    const Modele = models[modele];
    const lignes = await Modele.findAll({
      attributes: ['id', champUrl, champId],
      where: { [champUrl]: { [Op.ne]: null } },
    });
    for (const ligne of lignes) {
      const nouveau = await transferer(
        ligne[champUrl],
        ligne[champId],
        dossier,
        `${modele}.${champUrl} #${ligne.id}`
      );
      if (nouveau) {
        await Modele.update(
          { [champUrl]: nouveau.url, [champId]: nouveau.publicId },
          { where: { id: ligne.id }, silent: true, hooks: false }
        );
      }
    }
  }

  for (const [modele, champ, dossier] of LISTES) {
    const Modele = models[modele];
    const lignes = await Modele.findAll({ attributes: ['id', champ] });
    for (const ligne of lignes) {
      const elements = Array.isArray(ligne[champ]) ? ligne[champ] : [];
      let modifie = false;
      const nouveaux = [];
      for (const [i, element] of elements.entries()) {
        const nouveau = await transferer(
          element?.url,
          element?.publicId,
          dossier,
          `${modele}.${champ}[${i}] #${ligne.id}`
        );
        nouveaux.push(
          nouveau ? { ...element, url: nouveau.url, publicId: nouveau.publicId } : element
        );
        modifie = modifie || Boolean(nouveau);
      }
      if (modifie) {
        await Modele.update(
          { [champ]: nouveaux },
          { where: { id: ligne.id }, silent: true, hooks: false }
        );
      }
    }
  }
  return bilan;
};

if (require.main === module) {
  const appliquer = process.argv.includes('--appliquer');
  console.log(
    appliquer
      ? 'Transfert des fichiers vers Cloudflare R2…'
      : 'Simulation (aucune modification) — relancer avec --appliquer pour transférer :'
  );
  migrer({ appliquer })
    .then(async (bilan) => {
      await sequelize.close();
      console.log(
        `\nDéjà sur R2 : ${bilan.deja} · ${appliquer ? 'transférés' : 'à transférer'} : ${
          appliquer ? bilan.transferes : bilan.aTransferer
        } · échecs : ${bilan.echecs.length}`
      );
      for (const e of bilan.echecs) console.log(`  ✗ ${e.lieu} — ${e.raison} (${e.url})`);
      process.exit(bilan.echecs.length ? 1 : 0);
    })
    .catch(async (err) => {
      console.error(`✗ ${err.message}`);
      await sequelize.close();
      process.exit(1);
    });
}

module.exports = { migrer, aTransferer, dossierDe };
