/**
 * Emergency Short-Circuit Detector (Section 10 & Gate 9)
 * Deterministic pattern matching for acute emergencies.
 * Fires before the AI model is called, returning immediate emergency guidance
 * without sending text to the LLM.
 */

export interface EmergencyCheckResult {
  isEmergency: boolean;
  emergencyType?: 'CHEST_PAIN' | 'STROKE' | 'BREATHING' | 'OVERDOSE' | 'BLEEDING' | 'SELF_HARM' | 'GENERAL';
  emergencyMessage?: string;
}

const EMERGENCY_PATTERNS: Array<{
  type: EmergencyCheckResult['emergencyType'];
  patterns: RegExp[];
}> = [
  {
    type: 'CHEST_PAIN',
    patterns: [
      /\bchest pain\b/i,
      /\bchest pressure\b/i,
      /\bheart attack\b/i,
      /\bpain in (my )?chest\b/i,
      /\bcrushing pain\b/i,
      /\btightness in (my )?chest\b/i,
      /\bpain radiating to (my )?(left )?arm\b/i
    ]
  },
  {
    type: 'STROKE',
    patterns: [
      /\bstroke\b/i,
      /\bface\s+(is\s+)?droop/i,
      /\bfacial\s+droop/i,
      /\bslurred\s+speech\b/i,
      /\bsudden\s+numbness\b/i,
      /\bcan['’]?t\s+move\s+(my|her|his|their)?\s*(arm|face|leg)\b/i,
      /\bcannot\s+move\s+(my|her|his|their)?\s*(arm|face|leg)\b/i
    ]
  },
  {
    type: 'BREATHING',
    patterns: [
      /\bcan['’]?t\s+breathe\b/i,
      /\bcannot\s+breathe\b/i,
      /\bchoking\b/i,
      /\bsevere\s+shortness\s+of\s+breath\b/i,
      /\bgasping\s+for\s+(air|breath)\b/i,
      /\bstopped\s+breathing\b/i,
      /\bturning\s+blue\b/i
    ]
  },
  {
    type: 'OVERDOSE',
    patterns: [
      /\boverdose[ds]?\b/i,
      /\btook\s+(too\s+many|the\s+whole\s+bottle\s+of)\s+pills\b/i,
      /\bswallowed\s+(too\s+much|poison|bleach|chemicals)\b/i,
      /\baccidental\s+poisoning\b/i
    ]
  },
  {
    type: 'BLEEDING',
    patterns: [
      /\bsevere\s+bleeding\b/i,
      /\bheavy\s+bleeding\b/i,
      /\bbleeding\s+heavily\b/i,
      /\bwon['’]?t\s+stop\s+bleeding\b/i,
      /\bhemorrhag/i,
      /\bvomiting\s+blood\b/i,
      /\bcoughing\s+up\s+blood\b/i
    ]
  },
  {
    type: 'SELF_HARM',
    patterns: [
      /\bsuicide\b/i,
      /\bsuicidal\b/i,
      /\bwant to (kill|hurt|end) myself\b/i,
      /\bending my life\b/i,
      /\bhurt myself\b/i
    ]
  }
];

export const EMERGENCY_DISCLAIMER_MESSAGE =
  'EMERGENCY ALERT: If you or someone you are caring for is experiencing an acute medical emergency, ' +
  'please call 911 (or your local emergency services, such as 112 or 108) or go to the nearest emergency ' +
  'room immediately. CareBuddy is an informational assistant, not an emergency medical service.';

/**
 * Checks if user message contains acute emergency indicators
 */
export function checkEmergencyShortCircuit(userMessage: string): EmergencyCheckResult {
  const normalized = userMessage.trim();

  for (const category of EMERGENCY_PATTERNS) {
    for (const pattern of category.patterns) {
      if (pattern.test(normalized)) {
        return {
          isEmergency: true,
          emergencyType: category.type,
          emergencyMessage: EMERGENCY_DISCLAIMER_MESSAGE
        };
      }
    }
  }

  return { isEmergency: false };
}
