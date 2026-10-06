/**
 * Dependency-free annotation editor. Mounts into any element (page overlay,
 * extension tab, web app) and resolves with the final shapes or null on cancel.
 *
 * Tools: rectangle, arrow. Click a shape to select; drag it to move; pick a
 * colour to recolour the selection (or set the colour for the next shape).
 * Undo, delete, clear. ⌘/Ctrl+Z, Backspace/Delete, Esc, ⌘/Ctrl+Enter.
 */

import {
  ANNOTATION_COLORS,
  DEFAULT_ANNOTATION_COLOR,
  hitTest,
  newShapeId,
  normalizeShapes,
  renderShapesSvg,
  type Shape,
  type ShapeKind,
} from './annotations';

export interface EditorOptions {
  /** Image to annotate (object URL or data URL). */
  imageUrl: string;
  shapes: Shape[];
  /** Max size of the image box as a fraction of the host viewport (0.75 = 75%). */
  viewportFraction?: number;
  /** Optional host-provided container; otherwise a fixed full-screen scrim is created in `root`. */
  root: ParentNode;
  title?: string;
}

export const EDITOR_CSS = /* css */ `
  .uxa-scrim { position: fixed; inset: 0; z-index: 2147483647; background: rgba(17,17,19,.55); display: flex; align-items: center; justify-content: center; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #111113; }
  .uxa-panel { background: #fff; border-radius: 14px; box-shadow: 0 24px 80px rgba(0,0,0,.35); display: flex; flex-direction: column; overflow: hidden; max-width: 96vw; max-height: 96vh; }
  .uxa-bar { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid #ececef; }
  .uxa-bar .uxa-title { font-weight: 600; margin-right: 8px; }
  .uxa-tool, .uxa-ib { appearance: none; border: 1px solid #d9d9df; background: #fff; color: #3f3f46; width: 32px; height: 32px; border-radius: 7px; display: grid; place-items: center; cursor: pointer; }
  .uxa-tool.on { background: #7a5cff; border-color: #7a5cff; color: #fff; }
  .uxa-ib { border-color: transparent; }
  .uxa-ib:hover { background: #f3f3f5; }
  .uxa-ib:disabled { opacity: .4; cursor: default; }
  .uxa-sep { width: 1px; height: 22px; background: #e6e6ea; margin: 0 4px; }
  .uxa-sw { width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(0,0,0,.12); cursor: pointer; padding: 0; box-sizing: border-box; }
  .uxa-sw.on { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #111113; }
  .uxa-custom { width: 20px; height: 20px; border-radius: 50%; overflow: hidden; position: relative; background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); border: 1px solid rgba(0,0,0,.12); }
  .uxa-custom input { position: absolute; inset: -8px; opacity: 0; cursor: pointer; width: 40px; height: 40px; }
  .uxa-grow { flex: 1; }
  .uxa-btn { appearance: none; border: 1px solid #d9d9df; background: #fff; color: #3f3f46; border-radius: 7px; padding: 7px 14px; font-weight: 500; cursor: pointer; }
  .uxa-btn.p { background: #7a5cff; border-color: transparent; color: #fff; }
  .uxa-stage { position: relative; background: repeating-conic-gradient(#f0f0f3 0 25%, #fafafa 0 50%) 0 0 / 16px 16px; display: grid; place-items: center; }
  .uxa-box { position: relative; cursor: crosshair; user-select: none; -webkit-user-select: none; }
  .uxa-box img { display: block; width: 100%; height: 100%; pointer-events: none; }
  .uxa-box svg { position: absolute; inset: 0; pointer-events: none; }
  .uxa-hint { font-size: 11.5px; color: #8a8a94; padding: 8px 12px; border-top: 1px solid #ececef; }
`;

const ICON = {
  rect: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="5" width="16" height="14" rx="2"/></svg>',
  arrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M11 5h8v8"/></svg>',
  undo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  clear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M6 7l1 13h10l1-13M9 7V4h6v3"/><path d="M9 11l6 6M15 11l-6 6"/></svg>',
};

export function openAnnotationEditor(opts: EditorOptions): Promise<Shape[] | null> {
  return new Promise((resolve) => {
    const frac = opts.viewportFraction ?? 0.75;
    let shapes: Shape[] = opts.shapes.map((s) => ({ ...s }));
    const history: Shape[][] = [];
    let tool: ShapeKind = 'rect';
    let color: string = (shapes[shapes.length - 1]?.color as string | undefined) ?? DEFAULT_ANNOTATION_COLOR;
    let selectedId: string | null = null;
    let drag: null | { mode: 'draw' | 'move'; startX: number; startY: number; shape: Shape; orig?: Shape } = null;

    // ----- DOM -----
    const scrim = document.createElement('div');
    scrim.className = 'uxa-scrim';
    const panel = document.createElement('div');
    panel.className = 'uxa-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Annotate screenshot');
    scrim.append(panel);

    const bar = document.createElement('div');
    bar.className = 'uxa-bar';
    const title = document.createElement('span');
    title.className = 'uxa-title';
    title.textContent = opts.title ?? 'Annotate';
    const rectBtn = toolButton('rect', 'Rectangle (R)');
    const arrowBtn = toolButton('arrow', 'Arrow (A)');
    const swatches = document.createElement('div');
    swatches.style.cssText = 'display:flex;gap:6px;align-items:center';
    const swatchEls: HTMLButtonElement[] = [];
    for (const c of ANNOTATION_COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'uxa-sw';
      b.style.background = c;
      b.title = c;
      b.addEventListener('click', () => setColor(c));
      swatches.append(b);
      swatchEls.push(b);
    }
    const custom = document.createElement('label');
    custom.className = 'uxa-custom';
    custom.title = 'Custom colour';
    const customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.value = '#ff00aa';
    customInput.addEventListener('input', () => setColor(customInput.value));
    custom.append(customInput);
    swatches.append(custom);

    const undoBtn = iconButton(ICON.undo, 'Undo (⌘Z)', () => undo());
    const delBtn = iconButton(ICON.trash, 'Delete selected (⌫)', () => deleteSelected());
    const clearBtn = iconButton(ICON.clear, 'Clear all', () => {
      if (shapes.length === 0) return;
      pushHistory();
      shapes = [];
      selectedId = null;
      paint();
    });
    const grow = document.createElement('span');
    grow.className = 'uxa-grow';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'uxa-btn';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => finish(null));
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'uxa-btn p';
    done.textContent = 'Done';
    done.addEventListener('click', () => finish(normalizeShapes(shapes)));
    bar.append(title, rectBtn, arrowBtn, sep(), swatches, sep(), undoBtn, delBtn, clearBtn, grow, cancel, done);

    const stage = document.createElement('div');
    stage.className = 'uxa-stage';
    const box = document.createElement('div');
    box.className = 'uxa-box';
    const img = document.createElement('img');
    img.src = opts.imageUrl;
    img.alt = '';
    img.draggable = false;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    box.append(img, svg);
    stage.append(box);

    const hint = document.createElement('div');
    hint.className = 'uxa-hint';
    hint.textContent = 'Drag to draw. Click a shape to select it, drag to move, pick a colour to recolour. The original screenshot is never changed.';

    panel.append(bar, stage, hint);
    opts.root.append(scrim);

    // ----- sizing -----
    let boxW = 0;
    let boxH = 0;
    function layout() {
      const natW = img.naturalWidth || 800;
      const natH = img.naturalHeight || 500;
      const maxW = Math.max(320, window.innerWidth * frac);
      const maxH = Math.max(240, window.innerHeight * frac - 110);
      const scale = Math.min(maxW / natW, maxH / natH, 2);
      boxW = Math.round(natW * scale);
      boxH = Math.round(natH * scale);
      box.style.width = `${boxW}px`;
      box.style.height = `${boxH}px`;
      svg.setAttribute('width', String(boxW));
      svg.setAttribute('height', String(boxH));
      svg.setAttribute('viewBox', `0 0 ${boxW} ${boxH}`);
      paint();
    }
    if (img.complete && img.naturalWidth) layout();
    else img.addEventListener('load', layout, { once: true });
    window.addEventListener('resize', layout);

    // ----- helpers -----
    function toolButton(kind: ShapeKind, label: string): HTMLButtonElement {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'uxa-tool';
      b.title = label;
      b.innerHTML = ICON[kind];
      b.addEventListener('click', () => {
        tool = kind;
        selectedId = null;
        paint();
      });
      return b;
    }
    function iconButton(svgMarkup: string, label: string, onClick: () => void): HTMLButtonElement {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'uxa-ib';
      b.title = label;
      b.innerHTML = svgMarkup;
      b.addEventListener('click', onClick);
      return b;
    }
    function sep(): HTMLSpanElement {
      const s = document.createElement('span');
      s.className = 'uxa-sep';
      return s;
    }
    function setColor(c: string) {
      color = c;
      if (selectedId) {
        pushHistory();
        shapes = shapes.map((s) => (s.id === selectedId ? { ...s, color: c } : s));
      }
      paint();
    }
    function pushHistory() {
      history.push(shapes.map((s) => ({ ...s })));
      if (history.length > 50) history.shift();
    }
    function undo() {
      const prev = history.pop();
      if (!prev) return;
      shapes = prev;
      selectedId = null;
      paint();
    }
    function deleteSelected() {
      if (!selectedId) return;
      pushHistory();
      shapes = shapes.filter((s) => s.id !== selectedId);
      selectedId = null;
      paint();
    }
    function paint() {
      svg.innerHTML = renderShapesSvg(shapes, { width: boxW, height: boxH, selectedId });
      rectBtn.classList.toggle('on', tool === 'rect');
      arrowBtn.classList.toggle('on', tool === 'arrow');
      swatchEls.forEach((b, i) => b.classList.toggle('on', ANNOTATION_COLORS[i] === color));
      undoBtn.disabled = history.length === 0;
      delBtn.disabled = !selectedId;
      clearBtn.disabled = shapes.length === 0;
      box.style.cursor = selectedId ? 'move' : 'crosshair';
    }
    function norm(e: PointerEvent): [number, number] {
      const r = box.getBoundingClientRect();
      return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
    }

    // ----- pointer -----
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      box.setPointerCapture(e.pointerId);
      const [x, y] = norm(e);
      const tol = 8 / Math.max(boxW, 1);
      const hit = hitTest(shapes, x, y, tol);
      if (hit) {
        selectedId = hit.id;
        drag = { mode: 'move', startX: x, startY: y, shape: hit, orig: { ...hit } };
        pushHistory();
        paint();
        return;
      }
      selectedId = null;
      const shape: Shape = { id: newShapeId(), kind: tool, x1: x, y1: y, x2: x, y2: y, color };
      pushHistory();
      shapes = [...shapes, shape];
      drag = { mode: 'draw', startX: x, startY: y, shape };
      paint();
    });
    box.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const [x, y] = norm(e);
      if (drag.mode === 'draw') {
        shapes = shapes.map((s) => (s.id === drag!.shape.id ? { ...s, x2: x, y2: y } : s));
      } else {
        const dx = x - drag.startX;
        const dy = y - drag.startY;
        const o = drag.orig!;
        shapes = shapes.map((s) => (s.id === o.id ? { ...s, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy } : s));
      }
      paint();
    });
    const endDrag = () => {
      if (!drag) return;
      if (drag.mode === 'draw') {
        const s = shapes.find((k) => k.id === drag!.shape.id);
        if (s && Math.abs(s.x2 - s.x1) < 0.004 && Math.abs(s.y2 - s.y1) < 0.004) {
          // a click, not a drag: discard the empty shape and the history entry
          shapes = shapes.filter((k) => k.id !== s.id);
          history.pop();
        } else if (s) {
          selectedId = s.id;
        }
      }
      drag = null;
      paint();
    };
    box.addEventListener('pointerup', endDrag);
    box.addEventListener('pointercancel', endDrag);

    // ----- keys -----
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
      } else if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (meta && e.key === 'Enter') {
        e.preventDefault();
        finish(normalizeShapes(shapes));
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key.toLowerCase() === 'r' && !meta) {
        tool = 'rect';
        paint();
      } else if (e.key.toLowerCase() === 'a' && !meta) {
        tool = 'arrow';
        paint();
      }
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);

    function finish(result: Shape[] | null) {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', layout);
      scrim.remove();
      resolve(result);
    }
  });
}
