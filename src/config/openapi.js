const swaggerJsdoc = require('swagger-jsdoc');
const { inventorier } = require('../utils/inventaireRoutes');
const { LIBELLES_ROLES } = require('./roles');

/**
 * Documentation OpenAPI 3 GÉNÉRÉE à partir des routes réelles : chaque route
 * montée apparaît, avec son authentification, ses rôles et le schéma Joi
 * effectivement appliqué (corps, paramètres, requête). Les annotations JSDoc
 * `@swagger` des fichiers de routes complètent la description quand elles
 * existent (résumé, exemples de réponse).
 */

/* ── Conversion Joi → JSON Schema ─────────────────────────────────────────── */

const regle = (d, nom) => d.rules?.find((r) => r.name === nom)?.args;

const joiVersSchema = (d) => {
  if (!d) return {};
  const schema = {};
  const valeurs = (d.allow || []).filter((v) => v !== null && v !== '');
  if (d.allow?.includes(null)) schema.nullable = true;
  if (d.flags?.description) schema.description = d.flags.description;
  if (d.flags && 'default' in d.flags && typeof d.flags.default !== 'function') {
    schema.default = d.flags.default;
  }

  switch (d.type) {
    case 'object': {
      schema.type = 'object';
      const cles = d.keys || {};
      schema.properties = Object.fromEntries(
        Object.entries(cles).map(([cle, sous]) => [cle, joiVersSchema(sous)])
      );
      const requis = Object.entries(cles)
        .filter(([, sous]) => sous.flags?.presence === 'required')
        .map(([cle]) => cle);
      if (requis.length) schema.required = requis;
      break;
    }
    case 'array':
      schema.type = 'array';
      schema.items = d.items?.length ? joiVersSchema(d.items[0]) : {};
      if (regle(d, 'min')) schema.minItems = regle(d, 'min').limit;
      if (regle(d, 'max')) schema.maxItems = regle(d, 'max').limit;
      break;
    case 'number':
      schema.type = d.rules?.some((r) => r.name === 'integer') ? 'integer' : 'number';
      if (regle(d, 'min')) schema.minimum = regle(d, 'min').limit;
      if (regle(d, 'max')) schema.maximum = regle(d, 'max').limit;
      break;
    case 'boolean':
      schema.type = 'boolean';
      break;
    case 'date':
      schema.type = 'string';
      schema.format = 'date-time';
      break;
    case 'alternatives':
      schema.oneOf = (d.matches || []).map((m) => joiVersSchema(m.schema));
      break;
    case 'string':
      schema.type = 'string';
      if (regle(d, 'min')) schema.minLength = regle(d, 'min').limit;
      if (regle(d, 'max')) schema.maxLength = regle(d, 'max').limit;
      if (regle(d, 'length')) {
        schema.minLength = regle(d, 'length').limit;
        schema.maxLength = regle(d, 'length').limit;
      }
      if (d.rules?.some((r) => r.name === 'email')) schema.format = 'email';
      if (d.rules?.some((r) => r.name === 'guid')) schema.format = 'uuid';
      if (d.rules?.some((r) => r.name === 'uri')) schema.format = 'uri';
      if (regle(d, 'pattern')?.regex)
        schema.pattern = String(regle(d, 'pattern').regex).slice(1, -1);
      break;
    default:
      break;
  }
  if (d.flags?.only && valeurs.length) schema.enum = valeurs;
  return schema;
};

const parametres = (validations, source, emplacement) =>
  validations
    .filter((v) => v.source === source)
    .flatMap((v) => {
      const d = v.schema.describe();
      return Object.entries(d.keys || {}).map(([nom, sous]) => ({
        name: nom,
        in: emplacement,
        required: emplacement === 'path' || sous.flags?.presence === 'required',
        schema: joiVersSchema(sous),
      }));
    });

/* ── Construction du document ─────────────────────────────────────────────── */

const reponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
});

const operation = (route) => {
  const cheminParams = parametres(route.validations, 'params', 'path');
  const nomsParams = new Set(cheminParams.map((p) => p.name));
  for (const [, nom] of route.chemin.matchAll(/:(\w+)/g)) {
    if (!nomsParams.has(nom)) {
      cheminParams.push({ name: nom, in: 'path', required: true, schema: { type: 'string' } });
    }
  }
  const corps = route.validations.find((v) => v.source === 'body');
  const roles = route.roles?.map((r) => LIBELLES_ROLES[r] || r).join(', ');

  const op = {
    tags: [route.tag],
    summary: `${route.methode.toUpperCase()} ${route.chemin}`,
    description: [
      route.auth
        ? `Authentification requise${roles ? ` — rôles : ${roles}` : ''}.`
        : 'Route publique.',
      route.alias ? 'Alias d’une autre route (même comportement).' : '',
    ]
      .filter(Boolean)
      .join(' '),
    security: route.auth ? [{ bearerAuth: [] }] : [],
    parameters: [...cheminParams, ...parametres(route.validations, 'query', 'query')],
    responses: {
      [route.methode === 'post' ? '201' : '200']: {
        description: 'Succès',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } },
      },
      ...(route.validations.length ? { 400: reponse('Données invalides') } : {}),
      ...(route.auth
        ? {
            401: reponse('Jeton absent, invalide ou expiré'),
            403: reponse('Accès refusé (rôle ou compte désactivé)'),
          }
        : {}),
      ...(cheminParams.length ? { 404: reponse('Ressource introuvable') } : {}),
    },
  };
  if (corps) {
    op.requestBody = {
      required: true,
      content: { 'application/json': { schema: joiVersSchema(corps.schema.describe()) } },
    };
  }
  return op;
};

const genererOpenApi = (ROUTES, { prefixe = '/api/v1' } = {}) => {
  const paths = {};
  for (const route of inventorier(ROUTES)) {
    const chemin = route.chemin.replace(/:(\w+)/g, '{$1}');
    paths[chemin] = paths[chemin] || {};
    paths[chemin][route.methode] = operation(route);
  }

  // Annotations JSDoc existantes : elles enrichissent les opérations générées
  const annote = swaggerJsdoc({
    definition: { openapi: '3.0.0', info: { title: 'annotations', version: '0' } },
    apis: ['./src/modules/**/route/*.js'],
  });
  for (const [chemin, operations] of Object.entries(annote.paths || {})) {
    for (const [methode, detail] of Object.entries(operations)) {
      if (paths[chemin]?.[methode]) {
        const generee = paths[chemin][methode];
        paths[chemin][methode] = {
          ...generee,
          ...detail,
          description: [detail.description, generee.description].filter(Boolean).join('\n\n'),
          parameters: generee.parameters,
          responses: { ...generee.responses, ...detail.responses },
        };
      }
    }
  }

  return {
    openapi: '3.0.0',
    info: {
      title: 'API Yobante Colis',
      version: '2.0.0',
      description:
        'Transport de colis France ⇄ Sénégal. Documentation générée à partir des routes ' +
        'réellement montées : authentification, rôles et schémas de validation sont ceux du code. ' +
        `Chemin canonique : ${prefixe}/… (les chemins sans préfixe restent servis).`,
    },
    servers: [
      { url: prefixe, description: 'Chemin canonique' },
      { url: '/', description: 'Chemins historiques' },
    ],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        ApiSuccess: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'object', nullable: true },
          },
        },
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            details: { type: 'array', items: { type: 'string' } },
            requestId: { type: 'string' },
          },
        },
        User: { type: 'object', description: 'Profil utilisateur (sans mot de passe)' },
      },
      responses: {
        BadRequest: reponse('Données invalides'),
        Unauthorized: reponse('Jeton absent, invalide ou expiré'),
        Forbidden: reponse('Accès refusé'),
        NotFound: reponse('Ressource introuvable'),
      },
    },
    paths,
  };
};

module.exports = { genererOpenApi, joiVersSchema };
