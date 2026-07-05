const path = require('path');
const winston = require('winston');

const { combine, timestamp, errors, printf, colorize, json } = winston.format;

const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) => `[${ts}] ${level}: ${stack || message}`)
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports: [
    new winston.transports.File({ filename: path.join('logs', 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join('logs', 'combined.log') }),
    // Toujours actif : c'est la sortie que `docker logs` capture.
    new winston.transports.Console({ format: consoleFormat })
  ]
});
module.exports = logger;
