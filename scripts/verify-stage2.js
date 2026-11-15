/**
 * CareBuddy - Stage 2 Auth, Authorization & Gate 5 Verification Runner
 * Starts test PostgreSQL, ensures clean schema, and runs Vitest suite.
 */
const path = require('path');
const { spawn } = require('child_process');
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');
const fs = require('fs');

const TEST_PORT = 54329;
const DB_DIR = path.resolve(__dirname, '../.pgdata-stage2-test');
const MIGRATION_FILE = path.resolve(__dirname, '../apps/api/prisma/migrations/20261115000000_init/migration.sql');

async function main() {
  console.log('================================================================');
  console.log('   CareBuddy: Stage 2 Auth & Gate 5 Authorization Verification   ');
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

  // Set environment variables for tests
  process.env.DATABASE_URL = `postgresql://postgres:password@127.0.0.1:${TEST_PORT}/carebuddy?schema=public`;
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test_session_secret_super_secure_32_bytes_minimum_length_here_123456';
  process.env.INVITATION_PEPPER = 'test_invitation_pepper_hmac_secret_key_minimum_length_here_123456';

  console.log('\n[3/4] Running Gate 5 and Auth test suites via Vitest...\n');

  const vitest = spawn('npx', ['vitest', 'run', 'src/tests/gate5.test.ts', 'src/tests/auth.test.ts'], {
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
      console.log('   STAGE 2 EXIT CRITERIA PASSED: Gate 5 Permissions Matrix PASS! ');
      console.log('================================================================\n');
      process.exit(0);
    } else {
      console.error(`\n❌ Tests failed with exit code ${code}`);
      process.exit(code);
    }
  });
}

main().catch(async (err) => {
  console.error('\n❌ STAGE 2 VERIFICATION ERROR:', err);
  process.exit(1);
});
