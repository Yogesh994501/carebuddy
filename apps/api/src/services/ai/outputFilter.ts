/**
 * Output Safety Filter & Labeler (Section 10 & Gate 9)
 * Deterministic checks for clinical diagnosis, dose-alteration, or safety claims.
 * Sanitizes and replaces non-compliant outputs with standard medical disclaimers.
 */

export const SAFE_MEDICAL_FALLBACK =
  'CareBuddy gives information from your records and general education. ' +
  'It does not diagnose, prescribe, change doses or check drug interactions. ' +
  'Please consult your prescribing physician or pharmacist before making any changes to your medication routine.';

const DIAGNOSIS_PATTERNS = [
  /\b(you have|you are suffering from|you might have|diagnosed with)\b.*?\b(diabetes|hypertension|pneumonia|infection|cancer|covid|arthritis|depression|dementia)\b/i,
  /\bi diagnose you with\b/i,
  /\bthis confirms a diagnosis of\b/i,
  /\bmy diagnosis is\b/i,
  /\bclinical diagnosis\b/i
];

const DOSE_ALTERATION_PATTERNS = [
  /\b(you should|i recommend you|try to)\s+(increase|decrease|double|halve|stop taking|discontinue)\s+(your|the)?\s*(dose|dosage|medication|pill|tablet)\b/i,
  /\btake\s+\d+\s+(more|extra|less)\s+(pills|tablets|capsules|mg)\b/i,
  /\bi prescribe\b/i,
  /\byou need to take\s+[2-9]\s+tablets\b/i,
  /\bstop taking your\s+[a-zA-Z]+\b/i
];

const INTERACTION_GUARANTEE_PATTERNS = [
  /\bi (can )?confirm (that )?it is (completely|100%|totally)?\s*safe to combine\b/i,
  /\bi verify (that )?there are no (drug )?interactions\b/i,
  /\bno interactions exist between\b/i,
  /\bguaranteed safe to take together\b/i
];

export interface OutputFilterResult {
  content: string;
  isModified: boolean;
  sourceLabel: 'From your CareBuddy records' | 'General information';
}

/**
 * Validates and filters AI output against safety and compliance boundaries
 */
export function filterAssistantOutput(
  rawContent: string,
  recordsReferenced: boolean
): OutputFilterResult {
  let content = rawContent.trim();
  let isModified = false;

  // 1. Check for clinical diagnosis attempts
  for (const pattern of DIAGNOSIS_PATTERNS) {
    if (pattern.test(content)) {
      content = SAFE_MEDICAL_FALLBACK;
      isModified = true;
      break;
    }
  }

  // 2. Check for dose-altering or prescribing instructions
  if (!isModified) {
    for (const pattern of DOSE_ALTERATION_PATTERNS) {
      if (pattern.test(content)) {
        content = SAFE_MEDICAL_FALLBACK;
        isModified = true;
        break;
      }
    }
  }

  // 3. Check for interactions guarantees
  if (!isModified) {
    for (const pattern of INTERACTION_GUARANTEE_PATTERNS) {
      if (pattern.test(content)) {
        content = SAFE_MEDICAL_FALLBACK;
        isModified = true;
        break;
      }
    }
  }

  // Determine source label
  const sourceLabel: 'From your CareBuddy records' | 'General information' =
    recordsReferenced && !isModified
      ? 'From your CareBuddy records'
      : 'General information';

  return {
    content,
    isModified,
    sourceLabel
  };
}
