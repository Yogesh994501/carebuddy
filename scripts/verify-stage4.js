/**
 * CareBuddy - Stage 4 Worker and Notifications Verification Runner
 * Tests Gate 2 (Background scheduling with browser closed),
 * and Gate 4 (Full Worker Concurrency, SKIP LOCKED, and Crash Recovery).
 */
const path = require('path');
const { spawn } = require('child_process');
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');
const fs = require('fs');

const TEST_PORT = 54330;
const DB_DIR = path.resolve(__dirname, '../.pgdata-stage4-test');
const MIGRATION_FILE = path.resolve(__dirname, '../apps/api/prisma/migrations/20261115000000_init/migration.sql');

async function main() {
  console.log('================================================================');
  console.log('   CareBuddy: Stage 4 Worker & Notifications (Gates 2 & 4 Tests) ');
  console.log('================================================================\n');

  if (fs.existsSync(DB_DIR)) {
    try {
      fs.rmSync(DB_DIR, { recursive: true, force: true });
    } catch (e) {}
  }

  console.log(`[1/4] Spawning PostgreSQL instance on port ${TEST_PORT}...`);
  const pg = new EmbeddedPostgres({
    databaseDir: DB_DIR,
    user: 'postgres',
    password: 'password',
    port: TEST_PORT,
    persistent: false,
    autoRehydrateSymlinks: true
  });

  await pg.initialise();
  await pg.start();
  console.log('      ✓ PostgreSQL running.');

  const client = pg.getPgClient();
  await client.connect();

  console.log('[2/4] Initialising carebuddy database and schema...');
  await client.query('DROP DATABASE IF EXISTS carebuddy;');
  await client.query('CREATE DATABASE carebuddy;');
  await client.end();

  const { Client } = require('pg');
  const appClient = new Client({
    connectionString: `postgresql://postgres:password@127.0.0.1:${TEST_PORT}/carebuddy`
  });
  await appClient.connect();
  const migrationSql = fs.readFileSync(MIGRATION_FILE, 'utf-8');
  await appClient.query(migrationSql);
  await appClient.end();
  console.log('      ✓ Database schema and triggers initialized.');

  process.env.DATABASE_URL = `postgresql://postgres:password@127.0.0.1:${TEST_PORT}/carebuddy?schema=public`;
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test_session_secret_super_secure_32_bytes_minimum_length_here_123456';
  process.env.INVITATION_PEPPER = 'test_invitation_pepper_hmac_secret_key_minimum_length_here_123456';

  console.log('\n[3/4] Running Gate 2 (Background Scheduling) and Gate 4 (Worker Concurrency & DLQ) Vitest suites...\n');

  const testFiles = [
    'src/tests/gate2_background_scheduling.test.ts',
    'src/tests/gate4_worker_concurrency.test.ts'
  ];

  const vitest = spawn('npx', ['vitest', 'run', ...testFiles], {
    cwd: path.resolve(__dirname, '../apps/api'),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  });

  vitest.on('close', async (code) => {
    console.log('\n[4/4] Cleaning up database server...');
    try {
      await pg.stop();
    } catch (e) {}

    if (code === 0) {
      console.log('\n================================================================');
      console.log('   STAGE 4 EXIT CRITERIA PASSED: Gates 2 & 4 PASS!              ');
      console.log('   Background worker & notification center verified.            ');
      console.log('================================================================\n');
      process.exit(0);
    } else {
      console.error(`\n❌ Tests failed with exit code ${code}`);
      process.exit(code);
    }
  });
}

main().catch(async (err) => {
  console.error('\n❌ STAGE 4 VERIFICATION ERROR:', err);
  process.exit(1);
});
