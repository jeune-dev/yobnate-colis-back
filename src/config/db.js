require('dotenv').config();
const { Sequelize } = require('sequelize');
const { dialectOptions, pool, entier } = require('./dbOptions');

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST || '127.0.0.1',
  port: entier(process.env.DB_PORT, 5432),
  dialect: 'postgres',
  logging: false,
  dialectOptions: dialectOptions(),
  pool: pool(),
  define: { freezeTableName: true },
});

module.exports = sequelize;
