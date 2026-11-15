/**
 * CareBuddy - Local PostgreSQL Runner
 * Spawns a local PostgreSQL server on port 5432 or 54329 using embedded-postgres binaries.
 */
const path = require('path');
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');

const port = parseInt(process.env.POSTGRES_PORT || '54329', 10);
const dbDir = path.resolve(__dirname, '../.pgdata');

async function start() {
  console.log(`Starting CareBuddy local PostgreSQL on port ${port}...`);
  const pg = new EmbeddedPostgres({
    databaseDir: dbDir,
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
    port: port,
    persistent: true,
    autoRehydrateSymlinks: true
  });

  await pg.initialise();
  await pg.start();
  console.log(`✅ PostgreSQL is ready at postgresql://postgres:password@127.0.0.1:${port}/carebuddy`);

  // Ensure default database exists
  try {
    await pg.createDatabase(process.env.POSTGRES_DB || 'carebuddy');
  } catch (e) {
    // Database might already exist
  }

  process.on('SIGINT', async () => {
    console.log('Shutting down PostgreSQL...');
    await pg.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Shutting down PostgreSQL...');
    await pg.stop();
    process.exit(0);
  });
}

start().catch(console.error);
