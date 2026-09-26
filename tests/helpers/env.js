/**
 * Environnement commun à toutes les suites, chargé AVANT tout module applicatif
 * (voir `setupFiles` dans jest.config.js).
 *
 * Les tests d'intégration s'exécutent sur une base PostgreSQL JETABLE désignée
 * par les variables TEST_DB_* — jamais par les DB_* du fichier .env, qui
 * peuvent pointer sur une base de développement réelle : la suite la vide.
 * Sans TEST_DB_NAME, les suites qui ont besoin de la base sont ignorées.
 */
process.env.NODE_ENV = 'test';
// Chaque fichier repart sans DATABASE_URL : la suite e2e la positionne pour elle seule,
// et un worker Jest réutilisé ne doit pas la transmettre aux fichiers suivants.
delete process.env.DATABASE_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-'.padEnd(48, 'x');
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-'.padEnd(48, 'y');
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

// Aucun courriel réel : un port fermé fait échouer l'envoi immédiatement,
// échec déjà absorbé par infrastructure/mailer.js.
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '9';
process.env.APP_PUBLIC_URL = '';
process.env.API_PUBLIC_URL = '';

if (process.env.TEST_DB_NAME) {
  process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
  process.env.DB_PORT = process.env.TEST_DB_PORT || '5432';
  process.env.DB_USER = process.env.TEST_DB_USER || 'postgres';
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';
  process.env.DB_NAME = process.env.TEST_DB_NAME;
}
