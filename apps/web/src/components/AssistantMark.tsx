import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export type AssistantState = 'idle' | 'thinking' | 'alert';

export interface AssistantMarkProps {
  state?: AssistantState;
  size?: number | string;
  label?: string;
  standalone?: boolean;
  highContrast?: boolean;
  className?: string;
}

/**
 * Sprig - The CareBuddy Assistant Identity
 *
 * Characteristics:
 * - Friendly, calm, healthcare companion
 * - Single rounded leaf with #397B68 primary and #8DB9A6 secondary half
 * - Heart-shaped central vein
 * - Dot eyes and soft curved smile
 * - Readable down to 32px
 * - WCAG 2.2 AA compliant, reduced-motion aware, and screen-reader accessible
 */
export const AssistantMark: React.FC<AssistantMarkProps> = ({
  state = 'idle',
  size = 48,
  label,
  standalone = true,
  highContrast = false,
  className = ''
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Determine accessible text description
  const defaultLabels: Record<AssistantState, string> = {
    idle: 'Sprig, CareBuddy assistant (Idle)',
    thinking: 'Sprig is thinking',
    alert: label || 'Sprig has a reminder'
  };
  const activeLabel = label || defaultLabels[state];

  // Leaf container motion variants
  const leafVariants = {
    idle: {
      scale: shouldReduceMotion ? 1 : [1, 1.03, 1],
      rotate: 0,
      transition: {
        duration: 6,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    },
    thinking: {
      scale: 1,
      rotate: shouldReduceMotion ? 2 : [-2, 2, -2],
      transition: {
        duration: 3,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    },
    alert: {
      scale: 1,
      rotate: 0,
      transition: { duration: 0.3 }
    }
  };

  const highContrastStroke = highContrast ? '#1E2B28' : 'none';
  const highContrastWidth = highContrast ? 2 : 0;

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Screen reader state announcement */}
      <span className="sr-only" role="status" aria-live="polite">
        {activeLabel}
      </span>

      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role={standalone ? 'img' : undefined}
        aria-label={standalone ? activeLabel : undefined}
        aria-hidden={!standalone}
      >
        {/* Alert Ring (State: alert only, #D99B43) */}
        {state === 'alert' && (
          <circle
            cx="50"
            cy="50"
            r="46"
            stroke="#D99B43"
            strokeWidth="3.5"
            strokeDasharray="5 3"
            opacity="0.95"
          />
        )}

        {/* Animated Leaf Body */}
        <motion.g
          animate={state}
          variants={leafVariants}
          style={{ transformOrigin: '50% 84%' }}
        >
          {/* Stem */}
          <path
            d="M 50 84 C 50 89 48 93 45 95"
            stroke="#397B68"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Left Half: Primary #397B68 */}
          <path
            d="M 50 14 C 28 14 18 36 18 54 C 18 72 34 84 50 84 Z"
            fill="#397B68"
            stroke={highContrastStroke}
            strokeWidth={highContrastWidth}
          />

          {/* Right Half: Lighter Secondary #8DB9A6 */}
          <path
            d="M 50 14 C 72 14 82 36 82 54 C 82 72 66 84 50 84 Z"
            fill="#8DB9A6"
            stroke={highContrastStroke}
            strokeWidth={highContrastWidth}
          />

          {/* Central Vein forming a subtle Heart */}
          <path
            d="M 50 84 L 50 64 M 50 64 C 42 58 37 49 41 44 C 45 39 50 43 50 48 C 50 43 55 39 59 44 C 63 49 58 58 50 64 Z"
            stroke="#1E2B28"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={highContrast ? 0.7 : 0.35}
          />

          {/* Abstract Face */}
          {state === 'thinking' ? (
            // Eyes looking slightly up in thinking state
            <>
              <circle cx="42" cy="31" r="3.2" fill="#1E2B28" />
              <circle cx="58" cy="31" r="3.2" fill="#1E2B28" />
              <path
                d="M 46 40 Q 50 43 54 40"
                stroke="#1E2B28"
                strokeWidth="2.4"
                strokeLinecap="round"
                fill="none"
              />
            </>
          ) : (
            // Normal gentle open eyes and soft smile
            <>
              <circle cx="42" cy="34" r="3.2" fill="#1E2B28" />
              <circle cx="58" cy="34" r="3.2" fill="#1E2B28" />
              <path
                d="M 45 40 Q 50 44 55 40"
                stroke="#1E2B28"
                strokeWidth="2.4"
                strokeLinecap="round"
                fill="none"
              />
            </>
          )}
        </motion.g>

        {/* Thinking Dots (State: thinking only, animated sequence) */}
        {state === 'thinking' && (
          <g>
            <motion.circle
              cx="86"
              cy="34"
              r="3.5"
              fill="#A99AE8"
              animate={
                shouldReduceMotion
                  ? { opacity: 0.8, scale: 1 }
                  : { opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }
              }
              transition={{ duration: 1.4, repeat: Infinity, delay: 0 }}
            />
            <motion.circle
              cx="92"
              cy="24"
              r="3"
              fill="#A99AE8"
              animate={
                shouldReduceMotion
                  ? { opacity: 0.8, scale: 1 }
                  : { opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }
              }
              transition={{ duration: 1.4, repeat: Infinity, delay: 0.25 }}
            />
            <motion.circle
              cx="89"
              cy="14"
              r="2.5"
              fill="#A99AE8"
              animate={
                shouldReduceMotion
                  ? { opacity: 0.8, scale: 1 }
                  : { opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }
              }
              transition={{ duration: 1.4, repeat: Infinity, delay: 0.5 }}
            />
          </g>
        )}

        {/* Alert Exclamation Badge (State: alert only) */}
        {state === 'alert' && (
          <g transform="translate(76, 20)">
            <circle
              cx="0"
              cy="0"
              r="10"
              fill="#D99B43"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            {/* Exclamation Mark in #1E2B28 for WCAG AA contrast against #D99B43 fill */}
            <line
              x1="0"
              y1="-5"
              x2="0"
              y2="1"
              stroke="#1E2B28"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <circle cx="0" cy="4.5" r="1.2" fill="#1E2B28" />
          </g>
        )}
      </svg>
    </div>
  );
};

export default AssistantMark;
