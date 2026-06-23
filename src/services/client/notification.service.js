// services/client/notification.service.js

// TODO: getMesNotifications(userId, pagination)
//   - Notifications du client triées par date décroissante

// TODO: marquerLue(userId, notificationId)
//   - Vérifier appartenance, isRead=true

// TODO: marquerToutesLues(userId)
//   - isRead=true pour toutes les notifications du client

// TODO: getNbNonLues(userId)
//   - COUNT WHERE isRead=false
//   - Retourner { count }

// TODO: createNotification(userId, { titre, message, type, lienCible })
//   - Créer une notification en base
//   - Envoyer push notification si token FCM disponible (optionnel)
