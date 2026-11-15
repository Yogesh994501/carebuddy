/**
 * CareBuddy - Stage 1 Foundation & Database Migration Verification
 * Verifies that the full schema and migrations apply cleanly to a fresh, empty PostgreSQL database,
 * and proves that the append-only triggers strictly forbid UPDATE and DELETE operations.
 */
const fs = require('fs');
const path = require('path');
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');
const { Client } = require('pg');

const TEST_PORT = 54328;
const DB_DIR = path.resolve(__dirname, '../.pgdata-migration-test');
const MIGRATION_FILE = path.resolve(__dirname, '../apps/api/prisma/migrations/20261115000000_init/migration.sql');

const EXPECTED_TABLES = [
  'User',
  'Session',
  'RecoveryCode',
  'ConsentRecord',
  'ElderlyProfile',
  'CareNetwork',
  'CareNetworkMember',
  'Invitation',
  'Medication',
  'MedicationSchedule',
  'MedicationDose',
  'MedicationLog',
  'Appointment',
  'CaregiverNote',
  'Notification',
  'NotificationPreference',
  'ScheduledJob',
  'WorkerHeartbeat',
  'AuditLog',
  'UserSettings',
  'AssistantMessage'
];

async function main() {
  console.log('================================================================');
  console.log('   CareBuddy: Stage 1 Foundation & Migration Verification Test   ');
  console.log('================================================================\n');

  // 1. Ensure clean slate
  if (fs.existsSync(DB_DIR)) {
    console.log(`[1/6] Cleaning up old test database directory at ${DB_DIR}...`);
    try {
      fs.rmSync(DB_DIR, { recursive: true, force: true });
    } catch (e) {
      // Ignore if locked
    }
  }

  // 2. Initialise empty PostgreSQL cluster
  console.log(`[2/6] Initialising completely fresh, empty PostgreSQL cluster on port ${TEST_PORT}...`);
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
  console.log('      ✓ PostgreSQL instance running and ready for connections.');

  const client = new Client({
    connectionString: `postgresql://postgres:password@127.0.0.1:${TEST_PORT}/postgres`
  });
  await client.connect();

  try {
    // 3. Create fresh database
    console.log('[3/6] Creating empty database "carebuddy_migration_test"...');
    await client.query('DROP DATABASE IF EXISTS carebuddy_migration_test;');
    await client.query('CREATE DATABASE carebuddy_migration_test;');
    await client.end();

    const appClient = new Client({
      connectionString: `postgresql://postgres:password@127.0.0.1:${TEST_PORT}/carebuddy_migration_test`
    });
    await appClient.connect();

    // 4. Run migration.sql
    console.log('[4/6] Applying migration.sql cleanly on empty database...');
    const migrationSql = fs.readFileSync(MIGRATION_FILE, 'utf-8');
    await appClient.query(migrationSql);
    console.log('      ✓ Migration executed without errors.');

    // 5. Verify all 21 models/tables exist
    console.log('[5/6] Verifying all 21 models exist in the schema...');
    const tablesRes = await appClient.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public';
    `);
    const existingTables = new Set(tablesRes.rows.map(r => r.tablename));

    const missingTables = EXPECTED_TABLES.filter(t => !existingTables.has(t));
    if (missingTables.length > 0) {
      throw new Error(`Missing expected tables: ${missingTables.join(', ')}`);
    }
    console.log(`      ✓ All ${EXPECTED_TABLES.length} tables verified present:`);
    EXPECTED_TABLES.forEach(t => console.log(`        - ${t}`));

    // 6. Test append-only triggers
    console.log('[6/6] Testing append-only triggers on MedicationLog and AuditLog...');

    // 6a. MedicationLog append-only test
    // Create prerequisite records: User, Profile, Medication, Schedule, Dose
    await appClient.query(`
      INSERT INTO "User" (id, email, "passwordHash", name)
      VALUES ('u1', 'test@carebuddy.local', 'hash', 'Test User');

      INSERT INTO "ElderlyProfile" (id, name, timezone)
      VALUES ('p1', 'Grandma Rose', 'Asia/Kolkata');

      INSERT INTO "Medication" (id, "profileId", name, strength, dosage, "medicineType", "startDate")
      VALUES ('m1', 'p1', 'Metformin', '500mg', '1 tablet', 'TABLET', '2026-01-01');

      INSERT INTO "MedicationSchedule" (id, "medicationId", frequency, "timesOfDay", weekdays)
      VALUES ('s1', 'm1', 'ONCE_DAILY', ARRAY['08:00'], ARRAY[1,2,3,4,5,6,7]);

      INSERT INTO "MedicationDose" (id, "profileId", "medicationId", "scheduleId", "localDate", "localTime", "scheduledAt", timezone)
      VALUES ('d1', 'p1', 'm1', 's1', '2026-11-15', '08:00', now(), 'Asia/Kolkata');
    `);

    // Insert MedicationLog entry
    await appClient.query(`
      INSERT INTO "MedicationLog" (id, "doseId", "medicationId", "profileId", "actorUserId", action, "actionSource", "newState")
      VALUES ('log1', 'd1', 'm1', 'p1', 'u1', 'TAKEN', 'OWNER_APP', 'TAKEN');
    `);
    console.log('      ✓ INSERT into MedicationLog succeeded.');

    // Attempt UPDATE on MedicationLog -> MUST FAIL
    let updateMedLogFailed = false;
    try {
      await appClient.query(`UPDATE "MedicationLog" SET reason = 'tampered' WHERE id = 'log1';`);
    } catch (err) {
      if (err.message.includes('append-only')) {
        updateMedLogFailed = true;
        console.log(`      ✓ UPDATE on MedicationLog rejected by trigger: "${err.message.trim()}"`);
      } else {
        throw err;
      }
    }
    if (!updateMedLogFailed) {
      throw new Error('FAILURE: MedicationLog trigger allowed UPDATE operation!');
    }

    // Attempt DELETE on MedicationLog -> MUST FAIL
    let deleteMedLogFailed = false;
    try {
      await appClient.query(`DELETE FROM "MedicationLog" WHERE id = 'log1';`);
    } catch (err) {
      if (err.message.includes('append-only')) {
        deleteMedLogFailed = true;
        console.log(`      ✓ DELETE on MedicationLog rejected by trigger: "${err.message.trim()}"`);
      } else {
        throw err;
      }
    }
    if (!deleteMedLogFailed) {
      throw new Error('FAILURE: MedicationLog trigger allowed DELETE operation!');
    }

    // 6b. AuditLog append-only test
    await appClient.query(`
      INSERT INTO "AuditLog" (id, "profileId", "userId", action, "entityType", "entityId", details)
      VALUES ('audit1', 'p1', 'u1', 'AUTH_LOGIN', 'User', 'u1', '{"ip": "127.0.0.1"}');
    `);
    console.log('      ✓ INSERT into AuditLog succeeded.');

    // Attempt UPDATE on AuditLog -> MUST FAIL
    let updateAuditFailed = false;
    try {
      await appClient.query(`UPDATE "AuditLog" SET action = 'TAMPERED' WHERE id = 'audit1';`);
    } catch (err) {
      if (err.message.includes('append-only')) {
        updateAuditFailed = true;
        console.log(`      ✓ UPDATE on AuditLog rejected by trigger: "${err.message.trim()}"`);
      } else {
        throw err;
      }
    }
    if (!updateAuditFailed) {
      throw new Error('FAILURE: AuditLog trigger allowed UPDATE operation!');
    }

    // Attempt DELETE on AuditLog -> MUST FAIL
    let deleteAuditFailed = false;
    try {
      await appClient.query(`DELETE FROM "AuditLog" WHERE id = 'audit1';`);
    } catch (err) {
      if (err.message.includes('append-only')) {
        deleteAuditFailed = true;
        console.log(`      ✓ DELETE on AuditLog rejected by trigger: "${err.message.trim()}"`);
      } else {
        throw err;
      }
    }
    if (!deleteAuditFailed) {
      throw new Error('FAILURE: AuditLog trigger allowed DELETE operation!');
    }

    await appClient.end();

    console.log('\n================================================================');
    console.log('   STAGE 1 EXIT CRITERIA PASSED: Schema Migrates Cleanly!       ');
    console.log('   All 21 models created, triggers and immutability verified.   ');
    console.log('================================================================\n');

    try {
      await pg.stop();
    } catch (e) {}
    process.exit(0);
  } finally {
    try {
      await pg.stop();
    } catch (e) {
      // ignore
    }
  }
}

main().catch(err => {
  console.error('\n❌ STAGE 1 VERIFICATION FAILED:', err);
  process.exit(1);
});
