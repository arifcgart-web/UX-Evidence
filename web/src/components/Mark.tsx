import { MARK_GRADIENT_STOPS, MARK_PATH } from '@shared/logo';

/** The brand mark (gradient). */
export function Mark({ size = 24, id = 'mark' }: { size?: number; id?: string }) {
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
