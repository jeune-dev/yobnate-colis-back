-- Script d'initialisation de la base de données yobante_colis
-- Exécuté automatiquement au premier démarrage du conteneur PostgreSQL

-- Extensions utiles
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Création du schéma principal (si besoin d'isolation)
-- CREATE SCHEMA IF NOT EXISTS colis;