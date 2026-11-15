/**
 * CareBuddy - Stage 3 Medications, Dose Engine & Invariants Verification Runner
 * Tests Gate 3 (Timezone & DST), Gate 4 (Generator Concurrency & Duplicate Prevention),
 * and Gate 6 (Transition half: MISSED != TAKEN, State Machine, Corrections, Adherence).
 */
const path = require('path');
const { spawn } = require('child_process');
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');
const fs = require('fs');

const TEST_PORT = 54329;
const DB_DIR = path.resolve(__dirname, '../.pgdata-stage3-test');
const MIGRATION_FILE = path.resolve(__dirname, '../apps/api/prisma/migrations/20261115000000_init/migration.sql');

async function main() {
  console.log('================================================================');
  console.log('   CareBuddy: Stage 3 Medication Engine & Gates 3, 4, 6 Tests   ');
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

  console.log('\n[3/4] Running Gate 3, Gate 4 (Generator), and Gate 6 (Transition) Vitest suites...\n');

  const testFiles = [
    'src/tests/gate3_timezone_dst.test.ts',
    'src/tests/gate4_generator_concurrency.test.ts',
    'src/tests/gate6_state_machine.test.ts'
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
      console.log('   STAGE 3 EXIT CRITERIA PASSED: Gates 3, 4(gen), 6(trans) PASS!');
      console.log('================================================================\n');
      process.exit(0);
    } else {
      console.error(`\n❌ Tests failed with exit code ${code}`);
      process.exit(code);
    }
  });
}

main().catch(async (err) => {
  console.error('\n❌ STAGE 3 VERIFICATION ERROR:', err);
  process.exit(1);
});
