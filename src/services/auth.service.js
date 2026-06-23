// services/auth.service.js

// TODO: register(data)
//   - Vérifier unicité email
//   - Hasher password (bcrypt, saltRounds=12)
//   - Créer User (isVerified=false)
//   - Générer OTP email_verification (hashé, expire 10min)
//   - Envoyer email OTP de bienvenue
//   - Attribuer automatiquement une adresse virtuelle d'entrepôt (AdresseEntrepot)

// TODO: verifyEmail(userId, code)
//   - Vérifier OTP non expiré, non utilisé
//   - Activer isVerified=true, marquer OTP isUsed=true

// TODO: login(email, password)
//   - Vérifier isActive et isVerified
//   - Comparer password avec bcrypt
//   - Générer access token (15min) + refresh token (7j)
//   - Sauvegarder refresh token hashé en base
//   - Retourner { accessToken, user }

// TODO: refreshToken(token)
//   - Vérifier token en base et signature JWT
//   - Générer nouveau access token

// TODO: logout(userId, token)
//   - Supprimer le RefreshToken en base

// TODO: forgotPassword(email)
//   - Générer OTP reset_password (hashé, expire 10min)
//   - Envoyer email sans révéler si l'email existe

// TODO: resetPassword(userId, code, newPassword)
//   - Vérifier OTP, hasher nouveau password
//   - Invalider tous les refresh tokens

// TODO: changePassword(userId, oldPassword, newPassword)
//   - Vérifier ancien password, hasher le nouveau
//   - Invalider tous les refresh tokens
