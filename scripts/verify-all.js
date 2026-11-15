/**
 * CareBuddy - Comprehensive Verification Runner (All 10 Release Gates)
 * Run with: npm run verify:all
 */
const { execSync } = require('child_process');
const path = require('path');

const stages = [
  { name: 'Stage 1: Foundation & Append-Only Triggers', cmd: 'npm run verify:stage1' },
  { name: 'Section 12a: Sprig Identity & Accessibility Mark', cmd: 'npm run verify:assistant' },
  { name: 'Stage 2: Auth, Authorization & Gate 5 Permissions', cmd: 'npm run verify:stage2' },
  { name: 'Stage 3: Medications, Timezones & State Machine (Gates 3, 4, 6)', cmd: 'npm run verify:stage3' },
  { name: 'Stage 4: Worker, SKIP LOCKED & Notifications (Gates 2, 4)', cmd: 'npm run verify:stage4' },
  { name: 'Stage 5: Appointments, Care Network & Activity Timeline', cmd: 'npm run verify:stage5' },
  { name: 'Stage 6: Dashboards & Real-Time SSE Synchronization (Gate 7)', cmd: 'npm run verify:stage6' },
  { name: 'Stage 7: AI Assistant (Sprig) & Red-Team Suite (Gate 9)', cmd: 'npm run verify:stage7' },
  { name: 'Stage 8: Accessibility, Responsive Design & WCAG 2.2 AA (Gate 8)', cmd: 'npm run verify:stage8' },
  { name: 'Stage 9: Persistence (Gate 1) & Demo Reliability (Gate 10)', cmd: 'npm run verify:stage9' }
];

async function main() {
  console.log('================================================================');
  console.log('   CareBuddy: Executing Full 10-Gate Verification Suite');
  console.log('================================================================\n');

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    console.log(`\n[${i + 1}/${stages.length}] RUNNING: ${stage.name}`);
    console.log('----------------------------------------------------------------');
    try {
      execSync(stage.cmd, {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit'
      });
      console.log(`✓ PASSED: ${stage.name}`);
    } catch (err) {
      console.error(`\n❌ FAILED at stage ${i + 1}: ${stage.name}`);
      process.exit(1);
    }
  }

  console.log('\n================================================================');
  console.log('🎉 ALL TEN RELEASE GATES AND NINE STAGES 100% VERIFIED PASS!');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
