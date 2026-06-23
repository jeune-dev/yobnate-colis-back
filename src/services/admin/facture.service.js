// services/admin/facture.service.js

// TODO: getAllFactures(filters, pagination)
//   - Filtres : userId, statut, dateDebut, dateFin
//   - Include User, Expedition, Paiement

// TODO: getFactureById(id)
//   - Détail complet avec tous les includes

// TODO: genererFacture(expeditionId)
//   - Calculer montantFret + fraisDouane + fraisLivraison
//   - Générer référence unique (YBC-FAC-ANNEE-XXXXX)
//   - Définir dateLimitePaiement (ex: J+7)
//   - Créer la facture et notifier le client

// TODO: annulerFacture(id, raison)
//   - Passer à 'annulee' si non encore payée

// TODO: genererPDF(id)
//   - Générer le PDF de la facture avec les détails
//   - Retourner le buffer PDF

// TODO: exportFactures(filters, format)
//   - Export CSV/Excel
