/**
 * CareBuddy - Deterministic & Idempotent Demo Seed Script
 * Run with: npm run seed:demo
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('================================================================');
  console.log('   CareBuddy: Seeding Deterministic Demo Environment');
  console.log('================================================================\n');

  try {
    // Dynamic import of TS / compiled demo service or execute directly
    // Using demoService via api compiled output or direct ts-node/vitest or inline logic
    const { seedDemoData } = require('../apps/api/dist/services/demoService');
    const result = await seedDemoData(prisma);

    console.log('✓ Demo data seeded successfully:');
    console.log(`  - Profile ID: ${result.profileId} (Ramesh Patel, 72yo, Asia/Kolkata)`);
    console.log(`  - Demo Users: 4 accounts created (Elderly, 2x Family, Caregiver)`);
    console.log(`  - Medications: ${result.medicationCount} active medications`);
    console.log(`  - Doses: 30 days of historical doses with ~90% adherence`);
    console.log(`  - Appointments: ${result.appointmentCount} upcoming clinical visits`);
    console.log(`  - All demo accounts password: DemoPassword123!`);
    console.log('\n================================================================');
  } catch (err) {
    console.error('❌ Failed to seed demo data:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
