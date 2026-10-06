/**
 * The compact evidence form shown in-page right after a capture.
 *
 * Only `observation` is required. Everything else is optional so an
 * experienced user can type one sentence and hit ⌘↩.
 */

import { CATEGORIES, type Category, type EvidenceFields, isCategory } from '../types/evidence';
import type { DraftCreated } from '../types/messages';
import { normalizeTags } from '@shared/search';
import { openAnnotationEditor } from '@shared/annotationEditor';
import { overlaySvg, type Shape } from '@shared/annotations';

const MAX_SUGGESTIONS = 8;

/** Map the page-type heuristic onto a sensible default category. */
function suggestCategory(pageType: string): Category {
  switch (pageType) {
    case 'Product page':
      return 'Product Page';
    case 'Checkout':
    case 'Cart':
      return 'Checkout';
    case 'Pricing':
      return 'Pricing';
    case 'Search results':
      return 'Search';
    case 'Homepage':
      return 'Hero';
    case 'Account / auth':
      return 'Form';
    case 'Article':
      return 'Content';
    default:
      return 'Other';
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(path: string, size = 14): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = path;
  return svg;
}

const ICON_CLOSE = '<path d="M18 6 6 18M6 6l12 12"/>';
const ICON_WARN = '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>';
const ICON_CHEVRON = '<polyline points="9 18 15 12 9 6"/>';
const ICON_PEN = '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>';

export interface FormResult {
  action: 'save' | 'cancel';
  fields: EvidenceFields;
  annotations: Shape[];
}

export class EvidenceForm {
  private scrim = el('div', 'uxe-scrim');
  private tags: string[] = [];
  private shapes: Shape[] = [];
  private previewOverlay!: HTMLDivElement;
  private annotateBtn!: HTMLButtonElement;
  private resolve!: (r: FormResult) => void;
  private settled = false;

  private category!: HTMLSelectElement;
  private observation!: HTMLInputElement;
  private why!: HTMLInputElement;
  private notes!: HTMLTextAreaElement;
  private tagInput!: HTMLInputElement;
  private tagWrap!: HTMLDivElement;
  private suggestWrap!: HTMLDivElement;
  private saveBtn!: HTMLButtonElement;
  private obsError!: HTMLDivElement;

  constructor(
    private root: ShadowRoot,
    private host: HTMLElement,
    private draft: DraftCreated,
    private knownTags: string[],
  ) {}

  open(): Promise<FormResult> {
    this.build();
    this.root.append(this.scrim);
    this.host.dataset.mode = 'form';
    window.addEventListener('keydown', this.onKey, true);
    // Let the panel paint before focusing, otherwise some pages steal focus back.
    requestAnimationFrame(() => this.observation.focus());
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  private close(result: FormResult) {
    if (this.settled) return;
    this.settled = true;
    window.removeEventListener('keydown', this.onKey, true);
    this.scrim.remove();
    this.host.dataset.mode = 'idle';
    this.resolve(result);
  }

  setBusy(busy: boolean) {
    this.saveBtn.disabled = busy;
    this.saveBtn.textContent = busy ? 'Saving…' : 'Save Evidence';
  }

  /** Re-enable the form after a failed save so nothing typed is lost. */
  reopen() {
    this.settled = false;
    this.root.append(this.scrim);
    this.host.dataset.mode = 'form';
    window.addEventListener('keydown', this.onKey, true);
    this.setBusy(false);
    return new Promise<FormResult>((resolve) => {
      this.resolve = resolve;
    });
  }

  // ---------------------------------------------------------------------

  private build() {
    const panel = el('div', 'uxe-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Save UX evidence');

    // Header
    const head = el('div', 'uxe-head');
    const titleWrap = el('div');
    titleWrap.append(el('h2', undefined, 'Save evidence'));
    const source = el('div', 'uxe-source');
    source.textContent = `${this.draft.context.domain} · ${this.draft.context.pageTitle || this.draft.context.url}`;
    source.title = this.draft.context.url;
    titleWrap.append(source);
    const closeBtn = el('button', 'uxe-iconbtn');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Cancel');
    closeBtn.append(icon(ICON_CLOSE, 16));
    closeBtn.addEventListener('click', () => this.cancel());
    head.append(titleWrap, closeBtn);

    // Body
    const body = el('div', 'uxe-body');

    const preview = el('div', 'uxe-preview');
    const img = el('img');
    img.src = this.draft.previewUrl;
    img.alt = 'Captured screenshot';
    this.previewOverlay = el('div', 'uxe-overlay-marks');
    this.annotateBtn = el('button', 'uxe-annotate');
    this.annotateBtn.type = 'button';
    this.annotateBtn.append(icon(ICON_PEN, 13), el('span', undefined, 'Annotate'));
    this.annotateBtn.addEventListener('click', () => void this.annotate());
    preview.append(img, this.previewOverlay, el('span', 'uxe-dim', `${this.draft.previewWidth}×${this.draft.previewHeight}`), this.annotateBtn);
    img.addEventListener('load', () => this.paintMarks());
    body.append(preview);

    if (this.draft.clipped) {
      const note = el('div', 'uxe-clipped');
      note.append(
        icon(ICON_WARN, 14),
        el('span', undefined, 'The element extends beyond the visible area. Only the visible part was captured.'),
      );
      body.append(note);
    }

    // Category
    this.category = el('select', 'uxe-select');
    for (const c of CATEGORIES) {
      const opt = el('option', undefined, c);
      opt.value = c;
      this.category.append(opt);
    }
    const suggested = suggestCategory(this.draft.context.pageType);
    this.category.value = isCategory(suggested) ? suggested : 'Other';
    body.append(this.field('Category', this.category));

    // Observation (required)
    this.observation = el('input', 'uxe-input');
    this.observation.type = 'text';
    this.observation.placeholder = 'What did you notice?';
    this.observation.maxLength = 200;
    this.observation.addEventListener('input', () => this.clearError());
    this.obsError = el('div', 'uxe-error');
    this.obsError.style.display = 'none';
    const obsField = this.field('Observation', this.observation);
    obsField.append(this.obsError);
    body.append(obsField);

    // Why it matters
    this.why = el('input', 'uxe-input');
    this.why.type = 'text';
    this.why.placeholder = 'Why is this useful?';
    this.why.maxLength = 300;
    body.append(this.field('Why it matters', this.why, true));

    // Tags
    this.tagWrap = el('div', 'uxe-tags');
    this.tagInput = el('input');
    this.tagInput.type = 'text';
    this.tagInput.placeholder = 'Add tag, press Enter';
    this.tagInput.setAttribute('aria-label', 'Add tag');
    this.tagInput.addEventListener('keydown', this.onTagKey);
    this.tagInput.addEventListener('blur', () => this.commitTag());
    this.tagWrap.addEventListener('click', () => this.tagInput.focus());
    this.tagWrap.append(this.tagInput);
    this.suggestWrap = el('div', 'uxe-suggest');
    const tagField = this.field('Tags', this.tagWrap, true);
    tagField.append(this.suggestWrap);
    body.append(tagField);
    this.renderTags();

    // Notes (collapsed)
    this.notes = el('textarea', 'uxe-textarea');
    this.notes.placeholder = 'Additional context…';
    this.notes.rows = 3;
    const notesField = this.field('Notes', this.notes, true);
    notesField.style.display = 'none';
    const toggle = el('button', 'uxe-toggle');
    toggle.type = 'button';
    toggle.append(icon(ICON_CHEVRON, 12), el('span', undefined, 'Add notes'));
    const toggleWrap = el('div', 'uxe-field');
    toggleWrap.append(toggle);
    toggle.addEventListener('click', () => {
      toggleWrap.remove();
      notesField.style.display = '';
      this.notes.focus();
    });
    body.append(toggleWrap, notesField);

    // Footer
    const foot = el('div', 'uxe-foot');
    const shortcut = el('span', 'uxe-shortcut');
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    shortcut.textContent = `${isMac ? '⌘' : 'Ctrl'}+↩ to save`;
    const cancel = el('button', 'uxe-btn ghost', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.cancel());
    this.saveBtn = el('button', 'uxe-btn primary', 'Save Evidence');
    this.saveBtn.type = 'button';
    this.saveBtn.addEventListener('click', () => this.submit());
    foot.append(shortcut, cancel, this.saveBtn);

    panel.append(head, body, foot);
    this.scrim.append(panel);
    // Clicking the dimmed page area shouldn't lose the form — do nothing.
  }

  /** Open the full-size editor over the page (75% of the window). */
  private async annotate() {
    this.scrim.style.visibility = 'hidden';
    const result = await openAnnotationEditor({
      imageUrl: this.draft.previewUrl,
      shapes: this.shapes,
      viewportFraction: 0.75,
      root: this.root,
      title: 'Annotate screenshot',
    });
    this.scrim.style.visibility = '';
    if (result) this.shapes = result;
    this.paintMarks();
    this.observation.focus();
  }

  private paintMarks() {
    const img = this.previewOverlay.previousElementSibling as HTMLImageElement | null;
    if (!img) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    this.previewOverlay.style.width = `${w}px`;
    this.previewOverlay.style.height = `${h}px`;
    this.previewOverlay.innerHTML = overlaySvg(this.shapes, w, h);
    this.annotateBtn.lastElementChild!.textContent = this.shapes.length ? `Markings (${this.shapes.length})` : 'Annotate';
  }

  private field(labelText: string, control: HTMLElement, optional = false): HTMLDivElement {
    const wrap = el('div', 'uxe-field');
    const row = el('div', 'uxe-label-row');
    const label = el('label', undefined, labelText);
    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
      const id = `uxe-${labelText.toLowerCase().replace(/\W+/g, '-')}`;
      control.id = id;
      label.htmlFor = id;
    }
    row.append(label);
    if (optional) row.append(el('span', 'uxe-opt', 'optional'));
    wrap.append(row, control);
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------

  private onTagKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (e.key === 'Tab' && !this.tagInput.value.trim()) return; // let Tab move focus
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) return; // ⌘↩ = save
      e.preventDefault();
      this.commitTag();
    } else if (e.key === 'Backspace' && !this.tagInput.value && this.tags.length) {
      this.tags.pop();
      this.renderTags();
    }
  };

  private commitTag() {
    const raw = this.tagInput.value;
    if (!raw.trim()) return;
    this.tags = normalizeTags([...this.tags, ...raw.split(',')]);
    this.tagInput.value = '';
    this.renderTags();
  }

  private renderTags() {
    this.tagWrap.querySelectorAll('.uxe-chip').forEach((n) => n.remove());
    for (const tag of this.tags) {
      const chip = el('span', 'uxe-chip', tag);
      const remove = el('button', undefined, '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove tag ${tag}`);
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        this.tags = this.tags.filter((t) => t !== tag);
        this.renderTags();
        this.tagInput.focus();
      });
      chip.append(remove);
      this.tagWrap.insertBefore(chip, this.tagInput);
    }

    this.suggestWrap.textContent = '';
    const chosen = new Set(this.tags.map((t) => t.toLowerCase()));
    const suggestions = this.knownTags.filter((t) => !chosen.has(t.toLowerCase())).slice(0, MAX_SUGGESTIONS);
    for (const s of suggestions) {
      const b = el('button', undefined, `+ ${s}`);
      b.type = 'button';
      b.addEventListener('click', () => {
        this.tags = normalizeTags([...this.tags, s]);
        this.renderTags();
      });
      this.suggestWrap.append(b);
    }
  }

  // ---------------------------------------------------------------------
  // Submit / cancel
  // ---------------------------------------------------------------------

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.cancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      this.submit();
    } else {
      // Keep every other keystroke away from the host page's shortcuts.
      e.stopPropagation();
    }
  };

  private clearError() {
    this.observation.classList.remove('invalid');
    this.obsError.style.display = 'none';
  }

  private submit() {
    this.commitTag();
    const observation = this.observation.value.trim();
    if (!observation) {
      this.observation.classList.add('invalid');
      this.obsError.textContent = 'Add a short observation so you can find this later.';
      this.obsError.style.display = '';
      this.observation.focus();
      return;
    }
    const category = this.category.value;
    this.close({
      action: 'save',
      fields: {
        category: isCategory(category) ? category : 'Other',
        observation,
        whyItMatters: this.why.value,
        notes: this.notes.value,
        tags: this.tags,
      },
      annotations: this.shapes,
    });
  }

  private cancel() {
    this.close({
      action: 'cancel',
      fields: {
        category: 'Other',
        observation: '',
        whyItMatters: '',
        notes: '',
        tags: [],
      },
      annotations: [],
    });
  }
}
