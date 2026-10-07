/**
 * The compact evidence form shown in-page right after a capture.
 *
 * Only `observation` is required. Everything else is optional so an
 * experienced user can type one sentence and hit ⌘↩.
 */

import { allCategories, type Category, type EvidenceFields, isCategory, MAX_CATEGORY_LENGTH, normalizeCategory } from '../types/evidence';
import type { DraftCreated, Result } from '../types/messages';
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
const NEW_CATEGORY = '__uxe_new__';
const ICON_MONITOR = '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>';
const ICON_PHONE = '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>';
const ICON_PLUS = '<path d="M12 5v14M5 12h14"/>';
const ICON_RETAKE = '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>';
const ICON_TRASH = '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>';

/** What the form needs to show one view (desktop or mobile). */
export interface ViewPreview {
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
}

/** Hooks the content script provides for the mobile view. */
export interface MobileHooks {
  /** Hide nothing — the form hides itself first. Returns the new preview, null if cancelled, or an error. */
  capture: () => Promise<ViewPreview | { error: string } | null>;
  remove: () => Promise<void>;
}

type ViewName = 'desktop' | 'mobile';
const ICON_PEN = '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>';

export interface FormResult {
  action: 'save' | 'cancel';
  fields: EvidenceFields;
  annotations: Shape[];
  /** Markings on the mobile view; undefined when there is no mobile view. */
  mobileAnnotations?: Shape[];
}

export class EvidenceForm {
  private scrim = el('div', 'uxe-scrim');
  private tags: string[] = [];
  private shapes: Shape[] = [];
  private mobile: (ViewPreview & { shapes: Shape[] }) | null = null;
  private view: ViewName = 'desktop';
  private previewBox!: HTMLDivElement;
  private previewImg!: HTMLImageElement;
  private previewOverlay!: HTMLDivElement;
  private annotateBtn!: HTMLButtonElement;
  private mobileActions!: HTMLDivElement;
  private tabDesktop!: HTMLButtonElement;
  private tabMobile!: HTMLButtonElement;
  private mobileError!: HTMLDivElement;
  private resolve!: (r: FormResult) => void;
  private settled = false;

  private category!: HTMLSelectElement;
  private customCategories: string[] = [];
  private newCatRow!: HTMLDivElement;
  private newCatInput!: HTMLInputElement;
  private newCatError!: HTMLDivElement;
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
    private addCategory: (name: string) => Promise<Result<string[]>>,
    private mobileHooks?: MobileHooks,
  ) {
    this.customCategories = draft.categories ?? [];
  }

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

    // Desktop | Mobile switch (mobile is captured on demand)
    const tabs = el('div', 'uxe-viewtabs');
    tabs.setAttribute('role', 'tablist');
    this.tabDesktop = el('button', 'uxe-viewtab on');
    this.tabDesktop.type = 'button';
    this.tabDesktop.setAttribute('role', 'tab');
    this.tabDesktop.append(icon(ICON_MONITOR, 13), el('span', undefined, 'Desktop'));
    this.tabDesktop.addEventListener('click', () => this.showView('desktop'));
    this.tabMobile = el('button', 'uxe-viewtab add');
    this.tabMobile.type = 'button';
    this.tabMobile.setAttribute('role', 'tab');
    this.tabMobile.addEventListener('click', () => {
      if (this.mobile) this.showView('mobile');
      else void this.captureMobile();
    });
    tabs.append(this.tabDesktop, this.tabMobile);
    if (this.mobileHooks) body.append(tabs);

    const preview = el('div', 'uxe-preview');
    this.previewBox = preview;
    this.previewImg = el('img');
    this.previewImg.alt = 'Captured screenshot';
    this.previewOverlay = el('div', 'uxe-overlay-marks');
    this.annotateBtn = el('button', 'uxe-annotate');
    this.annotateBtn.type = 'button';
    this.annotateBtn.append(icon(ICON_PEN, 13), el('span', undefined, 'Annotate'));
    this.annotateBtn.addEventListener('click', () => void this.annotate());

    this.mobileActions = el('div', 'uxe-mobile-actions');
    const retake = el('button', 'uxe-annotate');
    retake.type = 'button';
    retake.title = 'Capture the mobile view again';
    retake.append(icon(ICON_RETAKE, 12), el('span', undefined, 'Retake'));
    retake.addEventListener('click', () => void this.captureMobile());
    const remove = el('button', 'uxe-annotate danger');
    remove.type = 'button';
    remove.title = 'Remove the mobile view';
    remove.setAttribute('aria-label', 'Remove mobile view');
    remove.append(icon(ICON_TRASH, 12));
    remove.addEventListener('click', () => void this.removeMobile());
    this.mobileActions.append(retake, remove);

    preview.append(this.previewImg, this.previewOverlay, this.annotateBtn, this.mobileActions);
    this.previewImg.addEventListener('load', () => this.paintMarks());
    body.append(preview);

    this.mobileError = el('div', 'uxe-error');
    this.mobileError.style.display = 'none';
    this.mobileError.style.marginTop = '-6px';
    this.mobileError.style.marginBottom = '10px';
    body.append(this.mobileError);
    this.renderView();

    if (this.draft.clipped) {
      const note = el('div', 'uxe-clipped');
      note.append(
        icon(ICON_WARN, 14),
        el('span', undefined, 'The element extends beyond the visible area. Only the visible part was captured.'),
      );
      body.append(note);
    }

    // Category (built-ins + this library's own, plus "Add category…")
    this.category = el('select', 'uxe-select');
    this.fillCategories(suggestCategory(this.draft.context.pageType));
    this.category.addEventListener('change', () => {
      if (this.category.value === NEW_CATEGORY) this.showNewCategory();
      else this.lastCategory = this.category.value;
    });
    const catField = this.field('Category', this.category);

    this.newCatRow = el('div', 'uxe-newcat');
    this.newCatRow.hidden = true;
    this.newCatInput = el('input', 'uxe-input');
    this.newCatInput.type = 'text';
    this.newCatInput.maxLength = MAX_CATEGORY_LENGTH;
    this.newCatInput.placeholder = 'New category name';
    this.newCatInput.setAttribute('aria-label', 'New category name');
    const addBtn = el('button', 'uxe-btn primary sm', 'Add');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => void this.commitNewCategory());
    const cancelBtn = el('button', 'uxe-btn ghost sm', 'Cancel');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => this.hideNewCategory());
    this.newCatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        void this.commitNewCategory();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.hideNewCategory();
      }
    });
    const row = el('div', 'uxe-newcat-row');
    row.append(this.newCatInput, addBtn, cancelBtn);
    this.newCatError = el('div', 'uxe-error');
    this.newCatError.hidden = true;
    this.newCatRow.append(row, this.newCatError);
    catField.append(this.newCatRow);
    body.append(catField);

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

  // ---------------------------------------------------------------------
  // Desktop / mobile views
  // ---------------------------------------------------------------------

  private currentShapes(): Shape[] {
    return this.view === 'mobile' && this.mobile ? this.mobile.shapes : this.shapes;
  }

  private setCurrentShapes(shapes: Shape[]) {
    if (this.view === 'mobile' && this.mobile) this.mobile.shapes = shapes;
    else this.shapes = shapes;
  }

  private showView(view: ViewName) {
    this.view = view === 'mobile' && this.mobile ? 'mobile' : 'desktop';
    this.renderView();
  }

  private renderView() {
    const isMobile = this.view === 'mobile' && !!this.mobile;
    const src = isMobile ? this.mobile!.previewUrl : this.draft.previewUrl;
    if (this.previewImg.src !== src) this.previewImg.src = src;
    this.previewBox.classList.toggle('is-mobile', isMobile);
    this.mobileActions.style.display = isMobile ? '' : 'none';

    this.tabDesktop.classList.toggle('on', !isMobile);
    this.tabDesktop.setAttribute('aria-selected', String(!isMobile));
    this.tabMobile.classList.toggle('on', isMobile);
    this.tabMobile.classList.toggle('add', !this.mobile);
    this.tabMobile.setAttribute('aria-selected', String(isMobile));
    this.tabMobile.replaceChildren(
      icon(this.mobile ? ICON_PHONE : ICON_PLUS, 13),
      el('span', undefined, this.mobile ? 'Mobile' : 'Add mobile view'),
    );
    this.paintMarks();
  }

  /** Hide the form, let the user pick the same section at phone width, then come back. */
  private async captureMobile() {
    if (!this.mobileHooks) return;
    this.mobileError.style.display = 'none';
    this.scrim.remove();
    window.removeEventListener('keydown', this.onKey, true);

    const result = await this.mobileHooks.capture();

    this.root.append(this.scrim);
    this.host.dataset.mode = 'form';
    window.addEventListener('keydown', this.onKey, true);

    if (result && 'error' in result) {
      this.mobileError.textContent = result.error;
      this.mobileError.style.display = '';
    } else if (result) {
      this.mobile = { ...result, shapes: [] };
      this.view = 'mobile';
    }
    this.renderView();
  }

  private async removeMobile() {
    if (!this.mobileHooks || !this.mobile) return;
    await this.mobileHooks.remove();
    this.mobile = null;
    this.view = 'desktop';
    this.renderView();
  }

  /** Open the full-size editor over the page (75% of the window). */
  private async annotate() {
    this.scrim.style.visibility = 'hidden';
    const isMobile = this.view === 'mobile' && !!this.mobile;
    const result = await openAnnotationEditor({
      imageUrl: isMobile ? this.mobile!.previewUrl : this.draft.previewUrl,
      shapes: this.currentShapes(),
      viewportFraction: 0.75,
      root: this.root,
      title: isMobile ? 'Annotate mobile screenshot' : 'Annotate screenshot',
    });
    this.scrim.style.visibility = '';
    if (result) this.setCurrentShapes(result);
    this.paintMarks();
    this.observation.focus();
  }

  /** Draw markings over the image's *rendered* box (object-fit: contain may letterbox it). */
  private paintMarks() {
    const img = this.previewImg;
    if (!img) return;
    const cw = img.clientWidth;
    const ch = img.clientHeight;
    const nw = img.naturalWidth || cw || 1;
    const nh = img.naturalHeight || ch || 1;
    const scale = Math.min(cw / nw, ch / nh);
    const w = nw * scale;
    const h = nh * scale;
    this.previewOverlay.style.left = `${img.offsetLeft + (cw - w) / 2}px`;
    this.previewOverlay.style.top = `${img.offsetTop + (ch - h) / 2}px`;
    this.previewOverlay.style.width = `${w}px`;
    this.previewOverlay.style.height = `${h}px`;
    const shapes = this.currentShapes();
    this.previewOverlay.innerHTML = overlaySvg(shapes, w, h);
    this.annotateBtn.lastElementChild!.textContent = shapes.length ? `Markings (${shapes.length})` : 'Annotate';
  }

  // ---------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------

  private fillCategories(selected: string) {
    this.category.replaceChildren();
    for (const c of allCategories(this.customCategories, selected)) {
      const opt = el('option', undefined, c);
      opt.value = c;
      this.category.append(opt);
    }
    const add = el('option', undefined, '+ Add category…');
    add.value = NEW_CATEGORY;
    this.category.append(add);
    this.category.value = isCategory(selected) ? selected : 'Other';
    this.lastCategory = this.category.value;
  }

  private lastCategory = 'Other';

  private showNewCategory() {
    this.newCatRow.hidden = false;
    this.newCatInput.value = '';
    this.newCatError.hidden = true;
    this.newCatInput.focus();
  }

  private hideNewCategory() {
    this.newCatRow.hidden = true;
    this.category.value = this.lastCategory;
    this.category.focus();
  }

  private async commitNewCategory() {
    const name = normalizeCategory(this.newCatInput.value);
    if (!name) {
      this.newCatError.textContent = 'Type a category name first.';
      this.newCatError.hidden = false;
      return;
    }
    const existing = allCategories(this.customCategories).find((c) => c.toLowerCase() === name.toLowerCase());
    if (existing) {
      this.newCatRow.hidden = true;
      this.fillCategories(existing);
      return;
    }
    this.newCatInput.disabled = true;
    const res = await this.addCategory(name);
    this.newCatInput.disabled = false;
    if (!res.ok) {
      this.newCatError.textContent = res.error;
      this.newCatError.hidden = false;
      return;
    }
    this.customCategories = res.data;
    this.newCatRow.hidden = true;
    this.fillCategories(name);
    this.lastCategory = name;
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
    const category = this.category.value === NEW_CATEGORY ? this.lastCategory : this.category.value;
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
      mobileAnnotations: this.mobile ? this.mobile.shapes : undefined,
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
