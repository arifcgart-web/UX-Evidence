import { useEffect, useRef, useState, type ReactNode } from 'react';
import { overlaySvg, type Shape } from '@shared/annotations';

interface Props {
  src: string;
  alt: string;
  shapes: Shape[];
  /** Hide the markings (toggle) */
  hidden?: boolean;
  className?: string;
  /** object-fit cover (thumbnails) vs contain (detail) */
  cover?: boolean;
  children?: ReactNode;
}

/**
 * An <img> with the annotation overlay drawn to its *rendered* box, so shapes
 * line up at any size. For `cover` thumbnails the overlay is aligned to the
 * image's natural aspect (top-left anchored) to match object-position.
 */
export function AnnotatedImage({ src, alt, shapes, hidden, className, cover, children }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState<{ w: number; h: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    const im = img.current;
    if (!el || !im) return;

    const measure = () => {
      // Layout size (not getBoundingClientRect) so CSS transforms on ancestors don't skew the overlay.
      const r = { width: el.clientWidth, height: el.clientHeight };
      const nw = im.naturalWidth || 1;
      const nh = im.naturalHeight || 1;
      if (cover) {
        // object-fit: cover; object-position: top left → scale to fill, anchored top-left
        const scale = Math.max(r.width / nw, r.height / nh);
        setBox({ w: nw * scale, h: nh * scale, x: 0, y: 0 });
      } else {
        // object-fit: contain, centred
        const scale = Math.min(r.width / nw, r.height / nh);
        const w = nw * scale;
        const h = nh * scale;
        setBox({ w, h, x: (r.width - w) / 2, y: (r.height - h) / 2 });
      }
    };

    if (im.complete && im.naturalWidth) measure();
    im.addEventListener('load', measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      im.removeEventListener('load', measure);
      ro.disconnect();
    };
  }, [src, cover]);

  const show = !hidden && shapes.length > 0 && box;
  return (
    <div ref={wrap} className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      <img ref={img} src={src} alt={alt} />
      {show && (
        <div
          style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, pointerEvents: 'none' }}
          dangerouslySetInnerHTML={{ __html: overlaySvg(shapes, box.w, box.h) }}
        />
      )}
      {children}
    </div>
  );
}
