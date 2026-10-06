/**
 * Annotations drawn over a screenshot: rectangles and arrows.
 *
 * Coordinates are normalised (0..1) relative to the screenshot, so the same
 * shapes render correctly on the thumbnail, the popup, the full-size editor
 * and the web app regardless of pixel size. The screenshot itself is never
 * modified; shapes live beside it and can be hidden at any time.
 */

export type ShapeKind = 'rect' | 'arrow';

export interface Shape {
  id: string;
  kind: ShapeKind;
  /** Start point (rect: a corner; arrow: tail). Normalised 0..1. */
  x1: number;
  y1: number;
  /** End point (rect: opposite corner; arrow: head). Normalised 0..1. */
  x2: number;
  y2: number;
  color: string;
}

export const ANNOTATION_COLORS = ['#7a5cff', '#ffa640', '#ef4444', '#22c55e', '#2563eb', '#111113', '#ffffff'] as const;
export const DEFAULT_ANNOTATION_COLOR = ANNOTATION_COLORS[0];

export function isShapeArray(value: unknown): value is Shape[] {
  return (
    Array.isArray(value) &&
    value.every(
      (s) =>
        s &&
        typeof s === 'object' &&
        (s.kind === 'rect' || s.kind === 'arrow') &&
        ['x1', 'y1', 'x2', 'y2'].every((k) => typeof s[k] === 'number' && Number.isFinite(s[k])) &&
        typeof s.color === 'string',
    )
  );
}

export function newShapeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function normalizeShapes(shapes: Shape[]): Shape[] {
  return shapes
    .map((s) => ({ ...s, x1: clamp01(s.x1), y1: clamp01(s.y1), x2: clamp01(s.x2), y2: clamp01(s.y2) }))
    .filter((s) => Math.abs(s.x2 - s.x1) > 0.002 || Math.abs(s.y2 - s.y1) > 0.002)
    .slice(0, 50);
}

// ---------------------------------------------------------------------------
// Rendering (SVG string, usable from React, vanilla DOM and the web app)
// ---------------------------------------------------------------------------

export interface RenderOptions {
  /** Pixel width the SVG is displayed at; stroke widths scale with it. */
  width: number;
  height: number;
  /** Highlight this shape with handles (editor only). */
  selectedId?: string | null;
}

function strokeFor(width: number): number {
  // ~2.5px at 640px wide, never thinner than 1.5px on tiny thumbnails.
  return Math.max(1.5, Math.min(4, width / 256));
}

function arrowPath(x1: number, y1: number, x2: number, y2: number, head: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const a1 = angle + Math.PI * 0.8;
  const a2 = angle - Math.PI * 0.8;
  const hx1 = x2 + Math.cos(a1) * head;
  const hy1 = y2 + Math.sin(a1) * head;
  const hx2 = x2 + Math.cos(a2) * head;
  const hy2 = y2 + Math.sin(a2) * head;
  return `M${x1} ${y1} L${x2} ${y2} M${hx1} ${hy1} L${x2} ${y2} L${hx2} ${hy2}`;
}

/** SVG markup (without wrapper sizing) for the given shapes at a display size. */
export function renderShapesSvg(shapes: readonly Shape[], opts: RenderOptions): string {
  const { width, height } = opts;
  const sw = strokeFor(width);
  const halo = sw + 2.5;
  const parts: string[] = [];

  for (const s of shapes) {
    const x1 = s.x1 * width;
    const y1 = s.y1 * height;
    const x2 = s.x2 * width;
    const y2 = s.y2 * height;
    const selected = opts.selectedId === s.id;

    if (s.kind === 'rect') {
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${sw}" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="${halo}"/>`,
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${sw}" fill="none" stroke="${s.color}" stroke-width="${sw}"/>`,
      );
      if (selected) {
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#7a5cff" stroke-width="1" stroke-dasharray="4 3"/>`);
        for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
          parts.push(`<circle cx="${hx}" cy="${hy}" r="4.5" fill="#fff" stroke="#7a5cff" stroke-width="1.5"/>`);
        }
      }
    } else {
      const head = Math.max(8, sw * 4.5);
      const d = arrowPath(x1, y1, x2, y2, head);
      parts.push(
        `<path d="${d}" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="${halo}" stroke-linecap="round" stroke-linejoin="round"/>`,
        `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
      if (selected) {
        parts.push(
          `<circle cx="${x1}" cy="${y1}" r="4.5" fill="#fff" stroke="#7a5cff" stroke-width="1.5"/>`,
          `<circle cx="${x2}" cy="${y2}" r="4.5" fill="#fff" stroke="#7a5cff" stroke-width="1.5"/>`,
        );
      }
    }
  }
  return parts.join('');
}

/** A complete overlay <svg> element string sized to the image box. */
export function overlaySvg(shapes: readonly Shape[], width: number, height: number, selectedId?: string | null): string {
  if (shapes.length === 0) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="position:absolute;inset:0;pointer-events:none">${renderShapesSvg(shapes, { width, height, selectedId })}</svg>`;
}

/** Hit test in normalised space with a tolerance in normalised units. */
export function hitTest(shapes: readonly Shape[], px: number, py: number, tol: number): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    const s = shapes[i]!;
    if (s.kind === 'rect') {
      const x = Math.min(s.x1, s.x2);
      const y = Math.min(s.y1, s.y2);
      const w = Math.abs(s.x2 - s.x1);
      const h = Math.abs(s.y2 - s.y1);
      const inOuter = px >= x - tol && px <= x + w + tol && py >= y - tol && py <= y + h + tol;
      const inInner = px >= x + tol && px <= x + w - tol && py >= y + tol && py <= y + h - tol;
      if (inOuter && !inInner) return s;
    } else {
      // distance from point to segment
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const len2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / len2));
      const cx = s.x1 + t * dx;
      const cy = s.y1 + t * dy;
      if (Math.hypot(px - cx, py - cy) <= tol) return s;
    }
  }
  return null;
}
