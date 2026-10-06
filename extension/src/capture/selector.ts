/**
 * Capture mode: hover highlights the element under the cursor, click captures
 * it, drag captures an arbitrary region. ↑/↓ walk up and down the DOM so a
 * designer can grab "the whole card" rather than "the button inside it".
 *
 * The overlay sits on top of the page and receives all pointer events; the
 * element beneath is found with `elementsFromPoint`, skipping our own host.
 */

import type { Rect } from '../types/messages';
import type { CaptureMode } from '../types/evidence';

export interface Selection {
  rect: Rect;
  mode: Extract<CaptureMode, 'element' | 'region'>;
  /** True when the element extended beyond the viewport and was clipped. */
  clipped: boolean;
}

const DRAG_THRESHOLD = 6;

function clampToViewport(rect: DOMRect | Rect): { rect: Rect; clipped: boolean } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const right = Math.min(vw, rect.x + rect.width);
  const bottom = Math.min(vh, rect.y + rect.height);
  const clamped = { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
  const clipped =
    rect.x < 0 || rect.y < 0 || rect.x + rect.width > vw + 1 || rect.y + rect.height > vh + 1;
  return { rect: clamped, clipped };
}

function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = typeof el.className === 'string' && el.className.trim()
    ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
    : '';
  return `${tag}${id}${cls}`;
}

function isCapturable(el: Element | null): el is Element {
  if (!el) return false;
  if (el === document.documentElement || el === document.body) return true;
  const rect = el.getBoundingClientRect();
  return rect.width >= 2 && rect.height >= 2;
}

export class ElementSelector {
  private root: ShadowRoot;
  private overlay: HTMLDivElement;
  private box: HTMLDivElement;
  private label: HTMLDivElement;
  private hint: HTMLDivElement;

  private hovered: Element | null = null;
  /** Ancestors selected with ↑, so ↓ can walk back down. */
  private descentStack: Element[] = [];
  private pointer = { x: 0, y: 0 };

  private dragStart: { x: number; y: number } | null = null;
  private dragging = false;

  private resolve!: (s: Selection | null) => void;
  private done = false;

  constructor(root: ShadowRoot, private host: HTMLElement) {
    this.root = root;
    this.overlay = document.createElement('div');
    this.overlay.className = 'uxe-overlay';
    this.box = document.createElement('div');
    this.box.className = 'uxe-box';
    this.box.style.display = 'none';
    this.label = document.createElement('div');
    this.label.className = 'uxe-label';
    this.label.style.display = 'none';
    this.hint = document.createElement('div');
    this.hint.className = 'uxe-hint';
    this.hint.innerHTML =
      '<span><b>Click</b> element</span>' +
      '<span><b>Drag</b> region</span>' +
      '<span><kbd>↑</kbd><kbd>↓</kbd> parent / child</span>' +
      '<span><kbd>Esc</kbd> cancel</span>';
  }

  /** Resolves with the selection, or null if the user cancelled. */
  start(): Promise<Selection | null> {
    this.root.append(this.overlay, this.box, this.label, this.hint);
    this.host.dataset.mode = 'select';

    this.overlay.addEventListener('mousemove', this.onMove);
    this.overlay.addEventListener('mousedown', this.onDown);
    this.overlay.addEventListener('mouseup', this.onUp);
    this.overlay.addEventListener('contextmenu', this.prevent);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('scroll', this.onScroll, true);
    window.addEventListener('resize', this.onScroll);
    window.addEventListener('blur', this.onBlur);

    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  private finish(selection: Selection | null) {
    if (this.done) return;
    this.done = true;
    this.overlay.removeEventListener('mousemove', this.onMove);
    this.overlay.removeEventListener('mousedown', this.onDown);
    this.overlay.removeEventListener('mouseup', this.onUp);
    this.overlay.removeEventListener('contextmenu', this.prevent);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('scroll', this.onScroll, true);
    window.removeEventListener('resize', this.onScroll);
    window.removeEventListener('blur', this.onBlur);
    this.overlay.remove();
    this.box.remove();
    this.label.remove();
    this.hint.remove();
    this.host.dataset.mode = 'idle';
    this.resolve(selection);
  }

  cancel() {
    this.finish(null);
  }

  // ---------------------------------------------------------------------
  // Hover
  // ---------------------------------------------------------------------

  private elementAt(x: number, y: number): Element | null {
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (el === this.host || this.host.contains(el)) continue;
      if (isCapturable(el)) return el;
    }
    return null;
  }

  private setHovered(el: Element | null, resetStack = true) {
    this.hovered = el;
    if (resetStack) this.descentStack = [];
    this.paint();
  }

  private paint() {
    if (this.dragging) return;
    const el = this.hovered;
    if (!el) {
      this.box.style.display = 'none';
      this.label.style.display = 'none';
      return;
    }
    const r = el.getBoundingClientRect();
    this.drawBox(r.x, r.y, r.width, r.height, false);
    this.label.textContent = '';
    const dims = document.createElement('b');
    dims.textContent = `${Math.round(r.width)}×${Math.round(r.height)}`;
    this.label.append(describe(el), '  ', dims);
    this.positionLabel(r.x, r.y, r.height);
  }

  private drawBox(x: number, y: number, w: number, h: number, region: boolean) {
    this.box.style.display = 'block';
    this.box.classList.toggle('region', region);
    this.box.style.left = `${x}px`;
    this.box.style.top = `${y}px`;
    this.box.style.width = `${w}px`;
    this.box.style.height = `${h}px`;
  }

  private positionLabel(x: number, y: number, h: number) {
    this.label.style.display = 'block';
    const above = y - 26;
    this.label.style.left = `${Math.max(4, x)}px`;
    this.label.style.top = `${above >= 4 ? above : Math.min(window.innerHeight - 26, y + h + 4)}px`;
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  private prevent = (e: Event) => e.preventDefault();

  private onMove = (e: MouseEvent) => {
    this.pointer = { x: e.clientX, y: e.clientY };

    if (this.dragStart) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      if (!this.dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        this.dragging = true;
        this.label.style.display = 'none';
      }
      if (this.dragging) {
        const r = this.dragRect(e.clientX, e.clientY);
        this.drawBox(r.x, r.y, r.width, r.height, true);
        return;
      }
    }

    const el = this.elementAt(e.clientX, e.clientY);
    if (el !== this.hovered) this.setHovered(el);
  };

  private onScroll = () => {
    if (this.dragging) return;
    const el = this.elementAt(this.pointer.x, this.pointer.y);
    if (el !== this.hovered) this.setHovered(el);
    else this.paint();
  };

  private onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    this.dragStart = { x: e.clientX, y: e.clientY };
  };

  private onUp = (e: MouseEvent) => {
    if (e.button !== 0 || !this.dragStart) return;
    e.preventDefault();

    if (this.dragging) {
      const r = this.dragRect(e.clientX, e.clientY);
      this.dragStart = null;
      this.dragging = false;
      if (r.width < 4 || r.height < 4) {
        this.paint();
        return;
      }
      this.finish({ rect: clampToViewport(r).rect, mode: 'region', clipped: false });
      return;
    }

    this.dragStart = null;
    this.captureHovered();
  };

  private dragRect(x: number, y: number): Rect {
    const s = this.dragStart!;
    return {
      x: Math.min(s.x, x),
      y: Math.min(s.y, y),
      width: Math.abs(x - s.x),
      height: Math.abs(y - s.y),
    };
  }

  private onKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.finish(null);
        return;
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        this.captureHovered();
        return;
      case 'ArrowUp': {
        if (!this.hovered) return;
        e.preventDefault();
        e.stopPropagation();
        const parent = this.hovered.parentElement;
        if (parent && parent !== document.documentElement) {
          this.descentStack.push(this.hovered);
          this.setHovered(parent, false);
        }
        return;
      }
      case 'ArrowDown': {
        const child = this.descentStack.pop();
        if (!child) return;
        e.preventDefault();
        e.stopPropagation();
        this.setHovered(child, false);
        return;
      }
      default:
        return;
    }
  };

  private onBlur = () => {
    // Losing focus mid-drag leaves things inconsistent; just reset the drag.
    this.dragStart = null;
    this.dragging = false;
    this.paint();
  };

  private captureHovered() {
    if (!this.hovered) return;
    const { rect, clipped } = clampToViewport(this.hovered.getBoundingClientRect());
    if (rect.width < 2 || rect.height < 2) return;
    this.finish({ rect, mode: 'element', clipped });
  }
}
