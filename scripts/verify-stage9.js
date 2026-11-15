/**
 * CareBuddy - Stage 9 Demo Mode, Gate 1 (Persistence) & Gate 10 (Demo Reliability) Verification
 */
const path = require('path');
const { spawn, execSync } = require('child_process');
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');
const fs = require('fs');

const TEST_PORT = 54334;
const DB_DIR = path.resolve(__dirname, '../.pgdata-stage9-test');
const MIGRATION_FILE = path.resolve(__dirname, '../apps/api/prisma/migrations/20261115000000_init/migration.sql');

async function main() {
  console.log('================================================================');
  console.log('   CareBuddy: Stage 9 Demo Mode, Gate 1 & Gate 10 Verification');
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

  console.log('\n[3/5] Applying Database Migration & Immutability Triggers...');
  const migrationSql = fs.readFileSync(MIGRATION_FILE, 'utf-8');
  await client.query(migrationSql);
  console.log('      ✓ Schema and immutable triggers initialized.');
  await client.end();

  const testDbUrl = `postgresql://postgres:password@localhost:${TEST_PORT}/postgres?schema=public`;

  console.log('\n[4/5] Executing Gate 1 Persistence Test Suite...');
  const env = {
    ...process.env,
    DATABASE_URL: testDbUrl,
    PORT: '4009',
    NODE_ENV: 'test',
    SESSION_SECRET: 'stage9-test-session-secret-must-be-32-chars-long-min!',
    CSRF_SECRET: 'stage9-test-csrf-secret-must-be-32-chars-long-min!'
  };

  try {
    execSync('npx vitest run apps/api/src/tests/gate1_persistence.test.ts', {
      cwd: path.resolve(__dirname, '..'),
      env,
      stdio: 'inherit'
    });
    console.log('      ✓ Gate 1 Persistence test suite passed.');
  } catch (err) {
    console.error('❌ Gate 1 Persistence test failed:', err);
    await pg.stop();
    process.exit(1);
  }

  console.log('\n[5/5] Executing Gate 10 Demo Reliability & Isolation Test Suite...');
  try {
    execSync('npx vitest run apps/api/src/tests/gate10_demo_reliability.test.ts', {
      cwd: path.resolve(__dirname, '..'),
      env,
      stdio: 'inherit'
    });
    console.log('      ✓ Gate 10 Demo Reliability test suite passed.');
  } catch (err) {
    console.error('❌ Gate 10 Demo Reliability test failed:', err);
    await pg.stop();
    process.exit(1);
  }

  try {
    await pg.stop();
  } catch (e) {}

  console.log('\n================================================================');
  console.log('🎉 STAGE 9 VERIFIED: GATE 1 (PERSISTENCE) & GATE 10 (DEMO) PASS');
  console.log('================================================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
