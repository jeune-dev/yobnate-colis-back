-- Jeu de données volumineux pour les mesures de performance (base DÉDIÉE uniquement).
-- Usage : psql "$PERF_DATABASE_URL" -v hash='<bcrypt>' -f scripts/perf/seed.sql
\set ON_ERROR_STOP on
BEGIN;
TRUNCATE users, villes, services_expedition, points_collecte, colis, colis_pieces, suivi_colis,
         notifications, factures, activity_logs, token_blacklist, refresh_tokens CASCADE;

INSERT INTO villes (id, nom, pays, "createdAt", "updatedAt")
SELECT uuid_generate_v4(), 'Ville ' || g, (CASE WHEN g % 2 = 0 THEN 'FR' ELSE 'SN' END)::"enum_villes_pays", now(), now()
FROM generate_series(1, 40) g;

INSERT INTO services_expedition (id, code, nom, "createdAt", "updatedAt")
VALUES (uuid_generate_v4(), 'STD', 'Standard', now(), now()), (uuid_generate_v4(), 'EXP', 'Express', now(), now());

INSERT INTO points_collecte (id, code, nom, pays, "villeId", adresse, "createdAt", "updatedAt")
SELECT uuid_generate_v4(), 'PT-' || g, 'Point ' || g, v.pays::text::"enum_points_collecte_pays", v.id, 'Adresse ' || g, now(), now()
FROM generate_series(1, 20) g
JOIN LATERAL (SELECT id, pays FROM villes ORDER BY nom OFFSET (g % 40) LIMIT 1) v ON true;

INSERT INTO users (id, nom, prenom, email, password, telephone, role, "emailVerifie", "createdAt", "updatedAt")
SELECT uuid_generate_v4(), 'Nom' || g, 'Prenom' || g, 'client' || g || '@perf.test', :'hash',
       '+2217' || lpad(g::text, 8, '0'),
       (CASE WHEN g <= 5 THEN 'super_admin' ELSE 'client' END)::"enum_users_role", true,
       now() - (g % 365) * interval '1 day', now()
FROM generate_series(1, 20000) g;

CREATE TEMP TABLE u AS SELECT id, row_number() OVER (ORDER BY email) rn, telephone FROM users;
CREATE TEMP TABLE v AS SELECT id, row_number() OVER (ORDER BY nom) rn, pays FROM villes;
CREATE TEMP TABLE s AS SELECT id, row_number() OVER (ORDER BY code) rn FROM services_expedition;
CREATE TEMP TABLE p AS SELECT id, row_number() OVER (ORDER BY code) rn FROM points_collecte;
CREATE TEMP TABLE st AS SELECT e AS statut, row_number() OVER () rn FROM unnest(enum_range(NULL::"enum_colis_statut")) e;

INSERT INTO colis (id, reference, "userId", "serviceId", "expediteurNom", "expediteurTelephone", "paysDepart",
  "villeDepartId", "destinataireNom", "destinataireTelephone", "paysArrivee", "villeArriveeId",
  "poidsReelKg", "poidsFactureKg", statut, categorie, "montantTotal", "pointActuelId",
  "dateLivraisonEstimee", "createdAt", "updatedAt")
SELECT uuid_generate_v4(), 'YB' || lpad(g::text, 10, '0'), u.id, s.id, 'Exp ' || g, '+33600000000', 'FR',
  vd.id, 'Dest ' || g, ud.telephone, 'SN', va.id, 5, 5,
  st.statut::text::"enum_colis_statut",
  (ARRAY['documents','colis_moyen','colis_xxl'])[1 + g % 3]::"enum_colis_categorie",
  (g % 500) + 10, p.id,
  (now() - (g % 200) * interval '1 day')::date, now() - (g % 400) * interval '1 day', now()
FROM generate_series(1, 200000) g
JOIN u ON u.rn = 6 + (g % 19995)
JOIN u ud ON ud.rn = 6 + ((g * 7) % 19995)
JOIN s ON s.rn = 1 + g % 2
JOIN v vd ON vd.rn = 2 * (1 + g % 20)
JOIN v va ON va.rn = 2 * (1 + g % 20) - 1
JOIN p ON p.rn = 1 + g % 20
JOIN st ON st.rn = 1 + g % 19;

INSERT INTO colis_pieces (id, "colisId", "numeroSuivi", "poidsKg", ordre, "createdAt", "updatedAt")
SELECT uuid_generate_v4(), c.id, c.reference || '-' || k, 2, k, now(), now()
FROM colis c CROSS JOIN generate_series(1, 3) k;

INSERT INTO suivi_colis (id, "colisId", "codeEvenement", statut, libelle, "dateEvenement", "visiblePublic", "createdAt")
SELECT uuid_generate_v4(), c.id, 'SOUMIS', 'en_attente', 'Événement ' || k, c."createdAt" + k * interval '1 hour', true, now()
FROM colis c CROSS JOIN generate_series(1, 6) k;

INSERT INTO notifications (id, "userId", titre, message, "createdAt")
SELECT uuid_generate_v4(), u.id, 'Titre', 'Message ' || k, now() - k * interval '1 hour'
FROM u CROSS JOIN generate_series(1, 10) k;

INSERT INTO factures (id, reference, "userId", "colisId", "dateEmission", "montantTotal", "montantPaye", devise, statut, "dateLimitePaiement", "createdAt", "updatedAt")
SELECT uuid_generate_v4(), 'FA' || c.reference, c."userId", c.id, now(), c."montantTotal", 0, 'EUR', 'en_attente',
       (now() - (random() * 60)::int * interval '1 day')::date, now(), now()
FROM colis c WHERE c.reference LIKE '%0' OR c.reference LIKE '%5';

INSERT INTO activity_logs (id, "userId", action, "createdAt")
SELECT uuid_generate_v4(), u.id, 'colis.suivi.soumis', now() - (u.rn % 1000) * interval '1 minute'
FROM u CROSS JOIN generate_series(1, 10) k;
COMMIT;
ANALYZE;

-- Colis « lourd » représentatif d'un envoi réel : 10 pièces, 30 événements,
-- 3 paiements, 10 articles douaniers (sert à mesurer le détail d'une expédition).
BEGIN;
CREATE TEMP TABLE lourd AS
  SELECT c.id, c."userId", c.reference FROM colis c
   WHERE c."userId" = (SELECT "userId" FROM colis GROUP BY "userId" ORDER BY count(*) DESC, "userId" LIMIT 1)
   ORDER BY c."createdAt" DESC LIMIT 1;
INSERT INTO colis_pieces (id, "colisId", "numeroSuivi", "poidsKg", ordre, "createdAt", "updatedAt")
SELECT uuid_generate_v4(), l.id, l.reference || '-X' || k, 2, 3 + k, now(), now()
FROM lourd l CROSS JOIN generate_series(1, 7) k;
INSERT INTO suivi_colis (id, "colisId", "codeEvenement", statut, libelle, "dateEvenement", "visiblePublic", "createdAt")
SELECT uuid_generate_v4(), l.id, 'SOUMIS', 'en_attente', 'Étape ' || k, now() - (40 - k) * interval '1 hour', true, now()
FROM lourd l CROSS JOIN generate_series(1, 24) k;
INSERT INTO factures (id, reference, "userId", "colisId", "dateEmission", "montantTotal", "montantPaye", devise, statut, "createdAt", "updatedAt")
SELECT uuid_generate_v4(), 'FL' || l.reference, l."userId", l.id, now(), 300, 0, 'EUR', 'en_attente', now(), now()
FROM lourd l ON CONFLICT DO NOTHING;
INSERT INTO paiements (id, reference, "factureId", "userId", montant, methode, "createdAt", "updatedAt")
SELECT uuid_generate_v4(), 'PL' || k || l.reference, f.id, l."userId", 100, 'especes', now(), now()
FROM lourd l JOIN factures f ON f."colisId" = l.id CROSS JOIN generate_series(1, 3) k;
INSERT INTO declarations_douane (id, "colisId", "paysExport", "paysImport", "createdAt", "updatedAt")
SELECT uuid_generate_v4(), l.id, 'FR', 'SN', now(), now() FROM lourd l;
INSERT INTO articles_douane (id, "declarationId", designation, "valeurUnitaire", "createdAt", "updatedAt")
SELECT uuid_generate_v4(), d.id, 'Article ' || k, 10, now(), now()
FROM lourd l JOIN declarations_douane d ON d."colisId" = l.id CROSS JOIN generate_series(1, 10) k;
COMMIT;
