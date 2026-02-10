// CommonJS is required because Prisma loads this file via `require`.
const path = require('path');
const { config } = require('dotenv');
const { defineConfig, env } = require('@prisma/config');

// Load .env from backend root so DATABASE_URL is available for schema and CLI
config({ path: path.resolve(__dirname, '.env') });

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'npx ts-node prisma/seed.ts',
  },
});
