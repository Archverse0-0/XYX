import { z } from 'zod';
import { loadConfig } from '../packages/shared/src/config.js';
import { migrate, poolFor } from '../packages/shared/src/storage.js';

const cfg = loadConfig(z.object({ DATABASE_URL: z.string().min(1) }));
const db = poolFor(cfg.DATABASE_URL);
try {
  await migrate(db);
  console.log('Operational database migrations completed.');
} catch {
  console.error('DATABASE_MIGRATION_FAILED: check database connectivity and schema permissions.');
  process.exitCode = 1;
} finally { await db.end(); }
