/**
 * Vérification JWT centralisée.
 *
 * Extrait la logique auparavant dupliquée entre auth.middleware.js et
 * admin.middleware.js (extraction du token, vérification, contrôle de rôle) et
 * met en cache le résultat 30 secondes pour épargner une requête DB à chaque
 * appel authentifié — un compromis délibéré entre fraîcheur et performance : un
 * compte désactivé peut rester valable jusqu'à 30s après sa désactivation.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { jwtConfig } = require('../config/security');
const { UnauthorizedError, ForbiddenError } = require('../errors/AppError');
const cache = require('../config/cache');
const { User, TokenBlacklist } = require('../models');

const CACHE_TTL_MS = 30 * 1000;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

class JWTUtils {
  /**
   * Extraire le token du header Authorization.
   * Lance une erreur si le format est invalide ou absent.
   */
  static extractToken(req) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedError("Token d'authentification manquant");
    }
    return header.split(' ')[1];
  }

  /**
   * Vérifier et décoder le JWT.
   * Distingue expiration et invalidité pour un message plus précis.
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, jwtConfig.secret);
    } catch (err) {
      const message = err.name === 'TokenExpiredError' ? 'Token expiré' : 'Token invalide';
      throw new UnauthorizedError(message);
    }
  }

  /**
   * Rejette un token explicitement révoqué (déconnexion, changement de mot de
   * passe) même s'il n'a pas encore expiré côté JWT.
   */
  static async assertNotBlacklisted(token) {
    const blacklisted = await TokenBlacklist.findOne({ where: { tokenHash: sha256(token) } });
    if (blacklisted) throw new UnauthorizedError('Token révoqué');
  }

  /**
   * Vérifie que le rôle appartient à la liste autorisée pour la route.
   * `allowedRoles` null = aucune restriction de rôle (simple authentification).
   */
  static assertRoleAllowed(role, allowedRoles) {
    if (allowedRoles && !allowedRoles.includes(role)) {
      throw new ForbiddenError("Vous n'avez pas les permissions requises");
    }
  }

  /**
   * Vérifie et cache l'utilisateur.
   * Cherche le cache d'abord, puis la base sinon ; ne mémorise jamais le mot de passe.
   */
  static async verifyAndCache(userId) {
    const cacheKey = `auth:${userId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const user = await User.findByPk(userId, { attributes: ['id', 'role', 'isActive'] });
    if (!user) throw new UnauthorizedError('Utilisateur introuvable');

    const userObj = { id: user.id, role: user.role, isActive: user.isActive };
    cache.set(cacheKey, userObj, CACHE_TTL_MS);
    return userObj;
  }

  /**
   * Workflow complet : extraire → vérifier → contrôler la révocation → cacher → contrôler le rôle.
   * Utilisé par les middlewares auth et admin.
   */
  static async verifyUserFromHeader(req, allowedRoles = null) {
    const token = this.extractToken(req);
    const payload = this.verifyToken(token);
    await this.assertNotBlacklisted(token);

    const user = await this.verifyAndCache(payload.sub);
    this.assertRoleAllowed(user.role, allowedRoles);
    return user;
  }
}

module.exports = JWTUtils;
