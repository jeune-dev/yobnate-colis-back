/**
 * Détecteur de connexions prises HORS d'une transaction ouverte.
 *
 * Signale toute requête SQL émise, dans le même contexte asynchrone qu'une
 * transaction encore ouverte, sans cette transaction : elle prend une seconde
 * connexion au pool pendant que la transaction garde la sienne (et ses verrous).
 * Sous concurrence, ce motif épuise le pool (voir utils/transactions.js).
 *
 *   npx jest <tests> --setupFilesAfterEnv ./scripts/perf/detecteur-transactions.js
 *
 * Les occurrences sont ajoutées à DETECTEUR_SORTIE (/tmp/detecteur.jsonl) : test,
 * début de la requête et pile d'appels dans src/. Fichier absent = aucune occurrence.
 */
const { AsyncLocalStorage } = require('async_hooks');
const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

const contexte = new AsyncLocalStorage();
const SORTIE = process.env.DETECTEUR_SORTIE || '/tmp/detecteur.jsonl';
const SRC = `${path.resolve(__dirname, '../../src')}/`;
const proto = Sequelize.prototype;

if (!proto.detecteurInstalle) {
  proto.detecteurInstalle = true;

  const transaction = proto.transaction;
  proto.transaction = function (options, rappel) {
    if (typeof options === 'function') return this.transaction({}, options);
    if (!rappel) return transaction.call(this, options);
    return transaction.call(this, options, (t) => contexte.run({ t }, () => rappel(t)));
  };

  const query = proto.query;
  proto.query = function (sql, options = {}) {
    const ouverte = contexte.getStore()?.t;
    if (ouverte && !ouverte.finished && options?.transaction !== ouverte) {
      const pile = new Error().stack
        .split('\n')
        .filter((ligne) => ligne.includes(SRC))
        .map((ligne) => ligne.trim().replace(/^at /, '').replace(SRC, 'src/'))
        .slice(0, 8);
      let test = null;
      try {
        test = globalThis.expect.getState().currentTestName;
      } catch (_err) {
        /* hors de Jest */
      }
      const texte = String(typeof sql === 'object' ? sql.query || '' : sql).slice(0, 90);
      fs.appendFileSync(SORTIE, `${JSON.stringify({ test, sql: texte, pile })}\n`);
    }
    return query.call(this, sql, options);
  };
}
