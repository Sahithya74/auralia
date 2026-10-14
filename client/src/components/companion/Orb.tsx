import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../ui/Icons';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

const STATE_ICON: Record<OrbState, IconName> = {
  idle: 'bedtime',
  listening: 'graphic_eq',
  thinking: 'psychology',
  speaking: 'volume_up',
};

const STATE_SCALE: Record<OrbState, number> = { idle: 0.92, listening: 1.05, thinking: 1, speaking: 1.08 };

function useReduceMotion(): boolean {
  const system = useReducedMotion();
  const [app, setApp] = useState(() => document.documentElement.dataset.reducedMotion === 'true');
  useEffect(() => {
    const observer = new MutationObserver(() => setApp(document.documentElement.dataset.reducedMotion === 'true'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
    return () => observer.disconnect();
  }, []);
  return Boolean(system) || app;
}

interface OrbProps {
  /** Diameter of the orb itself in px; glows extend beyond it. */
  size?: number;
  variant?: 'home' | 'session';
  state?: OrbState;
  /** Text under the icon, e.g. "anbu" or "Listening". */
  label?: string;
  labelStyle?: 'name' | 'caps';
  /** Increments on spoken word boundaries so the orb pulses with the voice where the browser reports them. */
  pulse?: number;
  onClick?: () => void;
  ariaLabel?: string;
}

/**
 * Anbu's presence. Home: a warm breathing orb. Session: deeper terracotta with
 * ripples while listening, a slow pulse while thinking and movement while speaking.
 * With reduced motion it stays still and only the icon and label change.
 */
export function Orb({ size = 176, variant = 'home', state = 'idle', label, labelStyle = 'name', pulse = 0, onClick, ariaLabel }: OrbProps) {
  const reduce = useReduceMotion();
  const box = Math.round(size * 1.45);
  const active = state === 'listening' || state === 'speaking';

  const core =
    variant === 'home'
      ? 'bg-gradient-to-tr from-secondary-container via-primary-fixed to-surface-container-low shadow-xl'
      : 'bg-gradient-to-tr from-primary via-primary-container to-secondary-container shadow-xl';
  const inner =
    variant === 'home'
      ? 'bg-gradient-to-bl from-primary-container/80 via-secondary/60 to-primary-fixed-dim/90 shadow-inner'
      : 'bg-gradient-to-br from-surface/30 via-transparent to-primary/40';

  const content = (
    <motion.div
      className={`relative z-10 flex items-center justify-center rounded-full p-3 ${core}`}
      style={{ width: size, height: size }}
      animate={
        reduce
          ? { scale: 1 }
          : variant === 'home'
            ? { scale: [0.96, 1.06, 0.96] }
            : state === 'thinking'
              ? { scale: [0.98, 1.02, 0.98] }
              : { scale: STATE_SCALE[state] }
      }
      transition={
        reduce
          ? undefined
          : variant === 'home'
            ? { duration: 8, repeat: Infinity, ease: 'easeInOut' }
            : state === 'thinking'
              ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.5, ease: 'easeOut' }
      }
    >
      <div className={`flex h-full w-full flex-col items-center justify-center rounded-full p-4 text-center text-on-primary backdrop-blur-sm ${inner}`}>
        <Icon name={variant === 'home' ? 'graphic_eq' : STATE_ICON[state]} size={Math.round(size * 0.2)} className="drop-shadow-sm" />
        {label && (
          <span
            className={
              labelStyle === 'name'
                ? 'mt-1 font-display text-headline-sm lowercase'
                : 'mt-1 text-label-sm font-medium uppercase tracking-wider text-on-primary/90'
            }
          >
            {label}
          </span>
        )}
      </div>
      {state === 'speaking' && !reduce && (
        <motion.span
          key={pulse}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full bg-surface/25"
          initial={{ opacity: 0.45, scale: 0.9 }}
          animate={{ opacity: 0, scale: 1.12 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        />
      )}
    </motion.div>
  );

  return (
    <div className="relative flex items-center justify-center" style={{ width: box, height: box }}>
      {/* ambient bloom */}
      <div
        aria-hidden="true"
        className={`absolute rounded-full blur-3xl ${variant === 'home' ? 'bg-secondary-container/25' : 'bg-secondary-container/50'} ${reduce ? '' : 'animate-pulse'}`}
        style={{ width: box, height: box }}
      />
      <div
        aria-hidden="true"
        className={`absolute rounded-full ${variant === 'home' ? 'bg-primary-fixed/30 blur-xl' : 'bg-primary-fixed-dim/40 blur-2xl'}`}
        style={{ width: size * 1.18, height: size * 1.18 }}
      />
      {variant === 'session' && (
        <>
          <motion.div
            aria-hidden="true"
            className="absolute rounded-full bg-secondary-fixed/40"
            style={{ width: size * 1.27, height: size * 1.27 }}
            animate={reduce ? { scale: 1 } : { scale: active ? [1, 1.08, 1] : 1, opacity: active ? 1 : 0.6 }}
            transition={reduce ? undefined : { duration: 2.2, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
          />
          <motion.div
            aria-hidden="true"
            className="absolute rounded-full bg-secondary-fixed-dim/40"
            style={{ width: size * 1.09, height: size * 1.09 }}
            animate={reduce ? { scale: 1 } : { scale: active ? [1, 1.05, 1] : 1 }}
            transition={reduce ? undefined : { duration: 1.8, delay: 0.15, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
          />
        </>
      )}
      {onClick ? (
        <button type="button" onClick={onClick} aria-label={ariaLabel} className="relative z-10 rounded-full transition-transform active:scale-95">
          {content}
        </button>
      ) : (
        <div role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel} aria-hidden={ariaLabel ? undefined : true}>
          {content}
        </div>
      )}
    </div>
  );
}
