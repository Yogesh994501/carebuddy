/**
 * Verification test for Section 12a: Assistant Identity - Sprig
 */
const fs = require('fs');
const path = require('path');

const BRAND_DIR = path.resolve(__dirname, '../apps/web/public/brand');
const FILES = ['sprig-idle.svg', 'sprig-thinking.svg', 'sprig-alert.svg', 'favicon.svg'];
const PALETTE = {
  primary: '#397B68',
  secondary: '#8DB9A6',
  accent: '#A99AE8',
  text: '#1E2B28',
  warning: '#D99B43'
};

console.log('================================================================');
console.log('   Section 12a: Assistant Identity (Sprig) Verification        ');
console.log('================================================================\n');

let allPassed = true;

// 1. Verify static SVG files exist and are under 3 KB (3072 bytes)
console.log('[1/4] Verifying static SVG exports and file sizes (< 3 KB)...');
FILES.forEach(filename => {
  const filePath = path.join(BRAND_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ Missing file: ${filename}`);
    allPassed = false;
    return;
  }
  const stat = fs.statSync(filePath);
  const sizeKb = (stat.size / 1024).toFixed(2);
  if (stat.size > 3072) {
    console.error(`  ❌ ${filename} exceeds 3 KB: ${stat.size} bytes (${sizeKb} KB)`);
    allPassed = false;
  } else {
    console.log(`  ✓ ${filename}: ${stat.size} bytes (${sizeKb} KB)`);
  }
});

// 2. Verify Palette compliance and SVG validity
console.log('\n[2/4] Verifying CareBuddy palette colours & SVG semantics...');
FILES.forEach(filename => {
  const content = fs.readFileSync(path.join(BRAND_DIR, filename), 'utf-8');

  // Verify XML structure
  if (!content.includes('<svg') || !content.includes('</svg>')) {
    console.error(`  ❌ ${filename} is not valid SVG markup`);
    allPassed = false;
  }

  // Check required primary and secondary colours
  if (!content.includes(PALETTE.primary) || !content.includes(PALETTE.secondary)) {
    console.error(`  ❌ ${filename} missing primary (#397B68) or secondary (#8DB9A6) leaf halves`);
    allPassed = false;
  }

  // Check dark text colour for eyes/face
  if (!content.includes(PALETTE.text)) {
    console.error(`  ❌ ${filename} missing face details in text colour (#1E2B28)`);
    allPassed = false;
  }

  // Check alert specific elements
  if (filename === 'sprig-alert.svg') {
    if (!content.includes(PALETTE.warning)) {
      console.error(`  ❌ ${filename} missing warning ring (#D99B43)`);
      allPassed = false;
    }
    // Verify exclamation mark uses #1E2B28 for contrast on #D99B43
    if (!content.includes('stroke="#1E2B28"') && !content.includes('fill="#1E2B28"')) {
      console.error(`  ❌ ${filename} alert badge icon does not use #1E2B28 for contrast`);
      allPassed = false;
    }
  }

  console.log(`  ✓ ${filename} matches CareBuddy colour palette & SVG requirements.`);
});

// 3. Verify AssistantMark React component file exists and contains required features
console.log('\n[3/4] Verifying React AssistantMark component implementation...');
const COMPONENT_PATH = path.resolve(__dirname, '../apps/web/src/components/AssistantMark.tsx');
if (!fs.existsSync(COMPONENT_PATH)) {
  console.error('  ❌ Missing AssistantMark.tsx component');
  allPassed = false;
} else {
  const compContent = fs.readFileSync(COMPONENT_PATH, 'utf-8');

  const requiredTokens = [
    'export const AssistantMark',
    'useReducedMotion',
    'state = \'idle\'',
    'thinking',
    'alert',
    'role={standalone ? \'img\' : undefined}',
    'aria-label={standalone ? activeLabel : undefined}',
    'aria-hidden={!standalone}',
    'sr-only',
    '#397B68',
    '#8DB9A6',
    '#D99B43',
    '#1E2B28'
  ];

  requiredTokens.forEach(token => {
    if (!compContent.includes(token)) {
      console.error(`  ❌ AssistantMark component missing feature: ${token}`);
      allPassed = false;
    }
  });

  console.log('  ✓ AssistantMark React component implements all states, Framer Motion, accessibility & contrast rules.');
}

// 4. Summary
console.log('\n================================================================');
if (allPassed) {
  console.log('   SECTION 12a VERIFICATION PASSED: Sprig Identity Complete!   ');
  console.log('================================================================\n');
  process.exit(0);
} else {
  console.error('   SECTION 12a VERIFICATION FAILED!                             ');
  console.log('================================================================\n');
  process.exit(1);
}
