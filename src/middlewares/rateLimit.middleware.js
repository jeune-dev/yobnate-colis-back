const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { rateLimitConfig, authRateLimitConfig } = require('../config/security');
const redis = require('../config/redis');
const JWTUtils = require('../utils/jwtUtils');

const _skipEnDev = () => process.env.NODE_ENV !== 'production';

/**
 * Store des compteurs : Redis partagé entre les processus quand il est
 * configuré, mémoire sinon. `passOnStoreError` laisse passer les requêtes si
 * Redis tombe : une panne du cache ne doit pas rendre l'API indisponible.
 */
const store = (prefixe) => {
  if (!redis) return undefined;

  const magasin = new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: `rl:${prefixe}:`,
  });

  // rate-limit-redis lance le chargement de ses scripts Lua DANS son
  // constructeur et se contente de stocker les promesses ; personne ne les
  // consomme avant la premiere requete. Si Redis est indisponible, Node voit
  // donc un rejet sans gestionnaire et arrete le processus. On y attache un
  // gestionnaire vide : la promesse reste rejetee, `passOnStoreError` laisse
  // alors passer les requetes, et une panne de Redis degrade la limitation de
  // debit au lieu de faire tomber l'API.
  const ignorer = () => {};
  magasin.incrementScriptSha?.catch?.(ignorer);
  magasin.getScriptSha?.catch?.(ignorer);

  return magasin;
};

const limiteur = (prefixe, options) =>
  rateLimit({ passOnStoreError: true, store: store(prefixe), ...options });

/**
 * Clé du plafond global : le COMPTE pour une requête portant un jeton valide, l'IP
 * sinon. Compter par IP seule pénalisait tous les utilisateurs derrière une même
 * adresse (réseau mobile en NAT opérateur, bureau du back-office) : 1 000 requêtes
 * / 15 min se partageaient entre eux. La signature est vérifiée (HMAC, quelques
 * microsecondes) : un identifiant de compte inventé ne donne pas un budget neuf.
 */
const cleCompteOuIp = (req) => {
  const entete = String(req.headers.authorization || '');
  if (entete.startsWith('Bearer ')) {
    try {
      return `u:${JWTUtils.verifyToken(entete.slice(7)).sub}`;
    } catch (_err) {
      /* jeton invalide : compté à l'IP */
    }
  }
  return `ip:${req.ip}`;
};

const globalRateLimit = limiteur('global', { ...rateLimitConfig, keyGenerator: cleCompteOuIp });

/**
 * Inscription, confirmation d'email, mot de passe oublié : actions rares qui
 * déclenchent des envois, plafonnées par IP (AUTH_RATE_LIMIT_MAX, 10 / 15 min).
 * Ce compteur n'est plus partagé avec la connexion ni avec le suivi public : dix
 * consultations de suivi depuis une IP y bloquaient la connexion pendant 15 min.
 */
const authRateLimit = limiteur('auth', authRateLimitConfig);

/**
 * Connexion (anti force brute) : seuls les ÉCHECS comptent. Auparavant chaque
 * connexion réussie consommait le quota de l'IP : la 11e personne à se connecter
 * derrière une même adresse était refusée.
 * - par couple IP + identifiant : AUTH_RATE_LIMIT_MAX échecs / 15 min (un compte visé) ;
 * - par IP : LOGIN_ECHECS_IP_MAX échecs / 15 min (50), contre l'essai de nombreux comptes.
 */
const identifiantConnexion = (req) =>
  String(req.body?.identifiant || req.body?.email || req.body?.telephone || '')
    .trim()
    .toLowerCase()
    .slice(0, 150);
const connexionRateLimit = [
  limiteur('connexion-ip', {
    ...authRateLimitConfig,
    max: Number(process.env.LOGIN_ECHECS_IP_MAX) || 50,
    skipSuccessfulRequests: true,
  }),
  limiteur('connexion', {
    ...authRateLimitConfig,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${req.ip}|${identifiantConnexion(req)}`,
  }),
];

/**
 * Suivi public par numéro : budget propre (SUIVI_RATE_LIMIT_MAX, 30 / 15 min par
 * IP). Les numéros étant séquentiels, le plafond freine leur énumération.
 */
const suiviPublicRateLimit = limiteur('suivi', {
  ...authRateLimitConfig,
  max: Number(process.env.SUIVI_RATE_LIMIT_MAX) || 30,
  message: { success: false, message: 'Trop de recherches de suivi. Réessayez dans 15 minutes.' },
});

// 3 envois d'OTP / 15 min par email — anti-spam emails de reset
const otpEmailRateLimit = limiteur('otp', {
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  keyGenerator: (req) => String(req.body?.email || req.ip).toLowerCase(),
  message: {
    success: false,
    message: 'Trop de codes envoyés à cet email. Réessayez dans 15 minutes.',
  },
});

// Mesure d'audience : 60 événements / min par VISITEUR (identifiant anonyme), et non
// par IP : derrière un NAT opérateur, les visiteurs d'une même adresse se partageaient
// ces 60 envois et les suivants étaient perdus.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mesureRateLimit = limiteur('mesure', {
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  keyGenerator: (req) =>
    UUID.test(String(req.body?.visiteurId || '')) ? `v:${req.body.visiteurId}` : `ip:${req.ip}`,
  message: { success: false, message: 'Trop de requêtes de mesure.' },
});

// Mutations sensibles d'un compte connecté (mot de passe, suppression, export) — repris de Sign
const mutationRateLimit = limiteur('mutation', {
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { success: false, message: 'Trop de modifications. Réessayez dans 15 minutes.' },
});

// Envoi d'un code de vérification au compte connecté (par compte, pas par IP :
// de nombreux clients mobiles partagent une même IP d'opérateur)
const envoiCodeRateLimit = limiteur('code', {
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { success: false, message: 'Trop de codes demandés. Réessayez dans 15 minutes.' },
});

// Formulaire public de demande de suppression de compte : ouvert à Internet
const demandePubliqueRateLimit = limiteur('demande', {
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  message: { success: false, message: 'Trop de demandes. Réessayez dans une heure.' },
});

// Formulaire de contact des sites vitrines : ouvert à Internet, déclenche une
// notification aux administrateurs. 10 envois / heure par IP.
const contactPubliqueRateLimit = limiteur('contact', {
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  message: { success: false, message: 'Trop de messages envoyés. Réessayez dans une heure.' },
});

module.exports = {
  globalRateLimit,
  authRateLimit,
  connexionRateLimit,
  suiviPublicRateLimit,
  otpEmailRateLimit,
  mutationRateLimit,
  mesureRateLimit,
  envoiCodeRateLimit,
  demandePubliqueRateLimit,
  contactPubliqueRateLimit,
};
