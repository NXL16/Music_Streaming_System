import * as dotenv from 'dotenv';
import { defineConfig } from '@prisma/config';
import { join } from 'path';

dotenv.config({
  path: join(__dirname, '.env'),
});

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
