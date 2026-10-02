const path = require('path');
const { Sequelize } = require('sequelize');

const dialect = process.env.DB_DIALECT || 'sqlite';

let sequelize;
if (dialect === 'mysql') {
  sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    timezone: '+07:00',
    logging: false,
  });
} else {
  const storage = process.env.DB_STORAGE === ':memory:'
    ? ':memory:'
    : path.resolve(__dirname, '../..', process.env.DB_STORAGE || './data/taskflow.sqlite');
  sequelize = new Sequelize({ dialect: 'sqlite', storage, logging: false });
}

module.exports = sequelize;
