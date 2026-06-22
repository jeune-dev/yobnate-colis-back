const winston = require('winston');
const path = require('path');
const { format, transports, createLogger } = winston;

// Champs à masquer dans les logs (sécurité)
const SENSITIVE_FIELDS = ['password', 'token', 'access_token', 'refresh_token',
  'fcm_token', 'authorization', 'secret', 'client_secret', 'api_key',
  'card_number', 'cvv', 'pin', 'otp', 'mot_de_passe', 'ancien_password',
  'nouveau_password', 'old_password', 'new_password'];

function sanitize(obj, depth = 0) {
  if (depth > 5 || obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return obj;
  const clean = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(clean)) {
    if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))) {
      clean[key] = '[REDACTED]';
    } else if (typeof clean[key] === 'object') {
      clean[key] = sanitize(clean[key], depth + 1);
    }
  }
  return clean;
}

const logsDir = path.join(__dirname, '..', '..', 'logs');

const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.errors({ stack: true }),
  format((info) => {
    if (info.meta) info.meta = sanitize(info.meta);
    if (info.body) info.body = sanitize(info.body);
    return info;
  })(),
  format.json()
);

const devFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ level, message, timestamp, ...meta }) => {
    const extra = Object.keys(meta).length ? ' ' + JSON.stringify(sanitize(meta)) : '';
    return `${timestamp} [${level}] ${message}${extra}`;
  })
);

const isProd = process.env.NODE_ENV === 'production';

const logger = createLogger({
  level: isProd ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'nanei-backend', env: process.env.NODE_ENV || 'development' },
  transports: [
    // Console — toujours actif
    new transports.Console({
      format: isProd ? logFormat : devFormat,
    }),
    // Fichier erreurs (production)
    ...(isProd ? [
      new transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10 MB
        maxFiles: 5,
        tailable: true,
      }),
      new transports.File({
        filename: path.join(logsDir, 'combined.log'),
        maxsize: 20 * 1024 * 1024,
        maxFiles: 10,
        tailable: true,
      }),
    ] : []),
  ],
  exitOnError: false,
  exceptionHandlers: [
    new transports.Console({ format: isProd ? logFormat : devFormat }),
    ...(isProd ? [new transports.File({ filename: path.join(logsDir, 'exceptions.log') })] : []),
  ],
  rejectionHandlers: [
    new transports.Console({ format: isProd ? logFormat : devFormat }),
    ...(isProd ? [new transports.File({ filename: path.join(logsDir, 'rejections.log') })] : []),
  ],
});

module.exports = logger;
