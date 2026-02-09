// CommonJS is required because Prisma loads this file via `require`.
const { config } = require('dotenv');
const { defineConfig, env } = require('@prisma/config');

config();

module.exports = defineConfig({
  datasource: {
    url: env('DATABASE_URL'),
  },
});
