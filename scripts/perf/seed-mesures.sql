-- Complément de scripts/perf/seed.sql pour les tables récentes : 1 000 000 sessions de visite,
-- 300 000 simulations, 19 000 avis, 20 000 paiements, 200 000 jetons révoqués, 100 000
-- refresh tokens. Base DÉDIÉE uniquement :
--   psql "$PERF_DATABASE_URL" -f scripts/perf/seed-mesures.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE u AS SELECT id, row_number() OVER (ORDER BY email) rn FROM users WHERE role='client';
CREATE INDEX ON u (rn);
-- 1 000 000 sessions de mesure d'audience sur 400 jours
INSERT INTO visites (id, "visiteurId", "userId", plateforme, source, "referentDomaine", "pageEntree", "pagesVues", debut, "derniereActivite", "dureeSecondes")
SELECT uuid_generate_v4(), md5((g % 300000)::text)::uuid,
       CASE WHEN g % 4 = 0 THEN (SELECT id FROM u WHERE rn = 1 + g % 19000) END,
       (ARRAY['web','android','ios'])[1 + g % 3]::"enum_visites_plateforme",
       (ARRAY['direct','recherche','reseau_social','campagne','email','site_referent'])[1 + g % 6]::"enum_visites_source",
       CASE WHEN g % 6 = 5 THEN 'site' || (g % 50) || '.com' END, '/p' || (g % 30), 1 + g % 8,
       now() - (g % 400) * interval '1 day' - (g % 1440) * interval '1 minute',
       now() - (g % 400) * interval '1 day' - (g % 1440) * interval '1 minute' + (g % 900) * interval '1 second', g % 900
FROM generate_series(1, 1000000) g;
-- 300 000 simulations de devis
INSERT INTO simulations_devis (id, "visiteurId", "userId", categorie, "createdAt", "colisId")
SELECT uuid_generate_v4(), md5((g % 300000)::text)::uuid,
       CASE WHEN g % 3 = 0 THEN (SELECT id FROM u WHERE rn = 1 + g % 19000) END,
       (ARRAY['documents','colis_moyen','colis_xxl'])[1 + g % 3],
       now() - (g % 400) * interval '1 day', NULL
FROM generate_series(1, 300000) g;
-- 30 000 avis
INSERT INTO avis (id, "userId", note, titre, commentaire, statut, "createdAt", "updatedAt")
SELECT uuid_generate_v4(), u.id, 1 + (u.rn % 5), 'Titre', 'Commentaire ' || u.rn,
       (CASE WHEN u.rn % 5 = 0 THEN 'en_attente' ELSE 'publie' END)::"enum_avis_statut",
       now() - (u.rn % 400) * interval '1 day', now()
FROM u WHERE u.rn <= 19000;
-- paiements sur 20 000 factures
INSERT INTO paiements (id, reference, "factureId", "userId", montant, devise, methode, statut, "payeAt", "createdAt", "updatedAt")
SELECT uuid_generate_v4(), 'PA' || f.reference, f.id, f."userId", f."montantTotal", 'EUR', 'especes', 'succes',
       now() - (random()*300)::int * interval '1 day', now(), now()
FROM (SELECT * FROM factures ORDER BY reference LIMIT 20000) f;
-- 200 000 jetons révoqués (déconnexions) et 100 000 refresh tokens
INSERT INTO token_blacklist (id, token_hash, expires_at, created_at, updated_at)
SELECT uuid_generate_v4(), md5(g::text) || md5((g+1)::text), now() + interval '1 hour', now(), now()
FROM generate_series(1, 200000) g;
INSERT INTO refresh_tokens (id, "userId", "tokenHash", "expiresAt", "createdAt")
SELECT uuid_generate_v4(), u.id, md5(u.rn::text || k) || md5(k::text), now() + interval '7 day', now()
FROM u CROSS JOIN generate_series(1, 5) k;
COMMIT;
ANALYZE;
