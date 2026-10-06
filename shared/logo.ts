/** Brand mark: four overlapping circles with a knocked-out centre dot. */

export const MARK_PATH =
  'M192 0c35.346 0 64 28.654 64 64s-28.654 64-64 64c35.346 0 64 28.654 64 64s-28.654 64-64 64-64-28.654-64-64c0 35.346-28.654 64-64 64S0 227.346 0 192s28.654-64 64-64C28.654 128 0 99.346 0 64S28.654 0 64 0s64 28.654 64 64c0-35.346 28.654-64 64-64zm-64 100c-15.464 0-28 12.536-28 28s12.536 28 28 28 28-12.536 28-28-12.536-28-28-28z';

/** Purple-weighted brand gradient, top-left to bottom-right. */
export const MARK_GRADIENT_STOPS: ReadonlyArray<[number, string]> = [
  [0, '#5b3df5'],
  [0.4, '#7a5cff'],
  [0.78, '#ff7ad9'],
  [1, '#ffa640'],
];

/** Inline SVG of the mark (gradient). `id` must be unique per document instance. */
export function markSvg(size: number, id = 'uxe-mark-g'): string {
  const stops = MARK_GRADIENT_STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 256 256" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs><path fill="url(#${id})" fill-rule="evenodd" d="${MARK_PATH}"/></svg>`;
}

/** The mark on a white rounded tile — the app icon / hero tile. */
export function tileSvg(size: number, id = 'uxe-tile-g'): string {
  const r = Math.round(size * 0.28);
  const inner = Math.round(size * 0.6);
  const off = Math.round((size - inner) / 2);
  const stops = MARK_GRADIENT_STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/><rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="${r}" fill="none" stroke="rgba(17,17,19,0.12)"/><g transform="translate(${off} ${off}) scale(${inner / 256})"><path fill="url(#${id})" fill-rule="evenodd" d="${MARK_PATH}"/></g></svg>`;
}
