/* eslint-disable no-console -- script en ligne de commande : la sortie standard est son interface */
/**
 * Écrit la documentation OpenAPI (générée à partir des routes réelles) dans
 * docs/openapi.json, pour l'équipe mobile / back-office ou un outil externe
 * (Postman, générateur de client). Aucune connexion à la base n'est ouverte.
 *
 * Usage : npm run docs:openapi
 */
const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'export-openapi-'.padEnd(40, 'x');
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'export-openapi-r-'.padEnd(40, 'y');

const { ROUTES } = require('../src/modules');
const { genererOpenApi } = require('../src/config/openapi');

const spec = genererOpenApi(ROUTES);
const sortie = path.resolve(__dirname, '..', 'docs', 'openapi.json');
fs.mkdirSync(path.dirname(sortie), { recursive: true });
fs.writeFileSync(sortie, `${JSON.stringify(spec, null, 2)}\n`);
console.log(
  `✔ ${Object.keys(spec.paths).length} chemins documentés → ${path.relative(process.cwd(), sortie)}`
);
process.exit(0);
