import { Sequelize } from 'sequelize';
import config from '../config.js';

export const sequelize = new Sequelize({
  host: config.mysql.host,
  port: config.mysql.port,
  username: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  dialect: 'mysql',
  logging: false,
  define: { underscored: true },
  pool: { max: 20, min: 2, idle: 10_000, acquire: 30_000 },
});
