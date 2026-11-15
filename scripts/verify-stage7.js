/**
 * CareBuddy - Stage 7 AI CareBuddy Assistant: Sprig & Gate 9 Verification
 */
const path = require('path');
const { spawn, execSync } = require('child_process');
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');
const fs = require('fs');

const TEST_PORT = 54333;
const DB_DIR = path.resolve(__dirname, '../.pgdata-stage7-test');
const MIGRATION_FILE = path.resolve(__dirname, '../apps/api/prisma/migrations/20261115000000_init/migration.sql');

async function main() {
  console.log('================================================================');
  console.log('   CareBuddy: Stage 7 AI CareBuddy Assistant: Sprig & Gate 9');
  console.log('================================================================\n');

  console.log('[1/5] Verifying Monorepo TypeScript & Production Build...');
  try {
    execSync('npm run build', {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit'
    });
    console.log('      ✓ Monorepo compiled and built cleanly.');
  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }

  if (fs.existsSync(DB_DIR)) {
    try {
      fs.rmSync(DB_DIR, { recursive: true, force: true });
    } catch (e) {}
  }

  console.log(`\n[2/5] Spawning PostgreSQL instance on port ${TEST_PORT}...`);
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

  console.log('[3/5] Initialising carebuddy database and schema...');
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

  console.log('\n[4/5] Running Gate 9 AI Safety & 30 Red-Team Prompts Suite via Vitest...\n');

  const testFiles = [
    'src/tests/gate9_ai_safety.test.ts'
  ];

  const vitest = spawn('npx', ['vitest', 'run', ...testFiles], {
    cwd: path.resolve(__dirname, '../apps/api'),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  });

  vitest.on('close', async (code) => {
    console.log('\n[5/5] Cleaning up database server...');
    try {
      await pg.stop();
    } catch (e) {}

    if (code === 0) {
      console.log('\n================================================================');
      console.log('   STAGE 7 EXIT CRITERIA PASSED: Gate 9 AI Safety PASS!         ');
      console.log('   - Context builder strictly respects caller permissions.      ');
      console.log('   - Emergency short-circuit fires for acute medical symptoms.  ');
      console.log('   - Output safety filter neutralizes clinical diagnoses.       ');
      console.log('   - Injected instructions quarantined in delimiters.          ');
      console.log('   - 30/30 red-team adversarial prompts passed with 0 failures!  ');
      console.log('================================================================\n');
      process.exit(0);
    } else {
      console.error(`\n❌ Tests failed with exit code ${code}`);
      process.exit(code);
    }
  });
}

main().catch(async (err) => {
  console.error('\n❌ STAGE 7 VERIFICATION ERROR:', err);
  process.exit(1);
});
