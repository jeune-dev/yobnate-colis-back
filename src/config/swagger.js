const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Yobnate Colis',
      version: '1.0.0',
      description: 'API REST de gestion et suivi de colis — Yobnate Colis'
    },
    servers: [{ url: '/', description: 'Serveur courant' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      },
      schemas: {
        // ── Réponses génériques ────────────────────────────────────────────
        ApiSuccess: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'object', nullable: true }
          }
        },
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            errors: { type: 'array', items: { type: 'string' }, nullable: true }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            totalItems: { type: 'integer' },
            totalPages: { type: 'integer' },
            currentPage: { type: 'integer' },
            pageSize: { type: 'integer' }
          }
        },
        // ── Entités ────────────────────────────────────────────────────────
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nom: { type: 'string' },
            prenom: { type: 'string' },
            email: { type: 'string', format: 'email' },
            telephone: { type: 'string' },
            role: { type: 'string', enum: ['client', 'admin', 'super_admin'] },
            isActive: { type: 'boolean' },
            avatarUrl: { type: 'string', nullable: true },
            lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Ville: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nom: { type: 'string' },
            region: { type: 'string', nullable: true },
            isActive: { type: 'boolean' }
          }
        },
        Tarif: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            villeDepartId: { type: 'string', format: 'uuid' },
            villeArriveeId: { type: 'string', format: 'uuid' },
            typeColis: { type: 'string', enum: ['standard', 'express', 'fragile'] },
            prixParKg: { type: 'number' },
            prixFixe: { type: 'number' },
            delaiEstimeJours: { type: 'integer' },
            isActive: { type: 'boolean' }
          }
        },
        Colis: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            reference: { type: 'string', example: 'YBC-COL-2026-00001' },
            userId: { type: 'string', format: 'uuid' },
            expediteurNom: { type: 'string' },
            expediteurTelephone: { type: 'string' },
            villeDepartId: { type: 'string', format: 'uuid' },
            destinataireNom: { type: 'string' },
            destinataireTelephone: { type: 'string' },
            villeArriveeId: { type: 'string', format: 'uuid' },
            adresseLivraison: { type: 'string' },
            description: { type: 'string', nullable: true },
            typeColis: { type: 'string', enum: ['standard', 'express', 'fragile'] },
            poids: { type: 'number' },
            valeurDeclaree: { type: 'number', nullable: true },
            montant: { type: 'number', nullable: true },
            statut: { type: 'string', enum: ['en_attente', 'en_preparation', 'en_transit', 'arrive', 'recupere', 'livre', 'annule'] },
            photos: { type: 'array', items: { type: 'object' } },
            dateLivraisonEstimee: { type: 'string', format: 'date', nullable: true },
            dateLivraisonEffective: { type: 'string', format: 'date-time', nullable: true },
            annuleMotif: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        SuiviColis: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            colisId: { type: 'string', format: 'uuid' },
            statut: { type: 'string' },
            localisation: { type: 'string', nullable: true },
            commentaire: { type: 'string', nullable: true },
            createdBy: { type: 'string', format: 'uuid', nullable: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Facture: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            reference: { type: 'string', example: 'YBC-FAC-2026-00001' },
            colisId: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            montantTransport: { type: 'number' },
            remise: { type: 'number' },
            montantTotal: { type: 'number' },
            statut: { type: 'string', enum: ['en_attente', 'payee', 'annulee'] },
            dateEmission: { type: 'string', format: 'date' },
            dateLimitePaiement: { type: 'string', format: 'date', nullable: true }
          }
        },
        Paiement: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            factureId: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            montant: { type: 'number' },
            methode: { type: 'string', enum: ['wave', 'orange_money', 'carte', 'virement', 'cash'] },
            statut: { type: 'string', enum: ['en_attente', 'succes', 'echoue', 'rembourse'] },
            reference: { type: 'string', nullable: true },
            payeAt: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            titre: { type: 'string' },
            message: { type: 'string' },
            type: { type: 'string', enum: ['colis', 'paiement', 'systeme'] },
            isRead: { type: 'boolean' },
            lienCible: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        ActivityLog: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid', nullable: true },
            action: { type: 'string' },
            entite: { type: 'string', nullable: true },
            entiteId: { type: 'string', format: 'uuid', nullable: true },
            details: { type: 'object', nullable: true },
            ipAddress: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        }
      },
      // ── Réponses réutilisables ─────────────────────────────────────────
      responses: {
        Unauthorized: {
          description: 'Token manquant, invalide ou expiré',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
        },
        Forbidden: {
          description: 'Permissions insuffisantes',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
        },
        NotFound: {
          description: 'Ressource introuvable',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
        },
        BadRequest: {
          description: 'Données invalides',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
        },
        Conflict: {
          description: 'Conflit de données',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
        }
      },
      // ── Paramètres réutilisables ───────────────────────────────────────
      parameters: {
        idParam: { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        pageParam: { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        limitParam: { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: ['./src/routes/**/*.js']
};

module.exports = swaggerJsdoc(options);
