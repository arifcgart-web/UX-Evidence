import type { ReactNode } from 'react';
import { MARK_GRADIENT_STOPS, MARK_PATH } from '@shared/logo';
import { Icon } from './Icon';

/** The brand mark on its white tile. */
export function Mark({ size = 24, id = 'hero-mark' }: { size?: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {MARK_GRADIENT_STOPS.map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

interface Props {
  title: string;
  subtitle?: string;
  /** Back arrow instead of the logo tile (Settings). */
  onBack?: () => void;
  /** Right-hand controls. */
  children?: ReactNode;
}

export function Hero({ title, subtitle, onBack, children }: Props) {
  return (
    <header className="hero">
      {onBack ? (
        <button type="button" className="hero-circle" aria-label="Back" onClick={onBack}>
          <Icon name="chevronLeft" size={18} />
        </button>
      ) : (
        <div className="hero-tile">
          <Mark size={24} />
        </div>
      )}
      <div className="hero-text">
        <div className="hero-title">{title}</div>
        {subtitle && <div className="hero-sub">{subtitle}</div>}
      </div>
      {children}
    </header>
  );
}
