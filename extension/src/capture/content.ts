/**
 * Content script entry. Injected on demand by the worker — never declared for
 * every site — and idempotent, so repeated injections are harmless.
 *
 * Flow:  ENTER_CAPTURE_MODE → select area → CAPTURE_AREA → form → SAVE_EVIDENCE
 */

import { ElementSelector } from './selector';
import { EvidenceForm } from './form';
import { collectContext } from './metadata';
import { OVERLAY_CSS } from './styles';
import type { DraftCreated, ExtensionMessage, Result } from '../types/messages';
import type { CaptureMode } from '../types/evidence';
import type { Rect } from '../types/messages';

declare global {
  interface Window {
    __uxEvidenceLoaded?: boolean;
  }
}

if (!window.__uxEvidenceLoaded) {
  window.__uxEvidenceLoaded = true;
  init();
}

function init() {
  const host = document.createElement('ux-evidence-collector');
  host.dataset.mode = 'idle';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;
  root.append(style);
  (document.documentElement ?? document.body).append(host);

  let active = false;

  async function send<T>(message: ExtensionMessage): Promise<Result<T>> {
    try {
      const response = (await chrome.runtime.sendMessage(message)) as Result<T> | undefined;
      return response ?? { ok: false, error: 'The extension did not respond. Reload the page and try again.' };
    } catch {
      return { ok: false, error: 'The extension was reloaded. Reload this page and try again.' };
    }
  }

  function toast(message: string, kind: 'ok' | 'error' = 'ok') {
    const node = document.createElement('div');
    node.className = `uxe-toast${kind === 'error' ? ' error' : ''}`;
    node.setAttribute('role', 'status');
    node.innerHTML =
      kind === 'ok'
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>';
    node.append(document.createTextNode(message));
    root.append(node);
    setTimeout(() => node.remove(), kind === 'ok' ? 1800 : 4000);
  }

  /** Two frames is enough for the overlay to be gone before the screenshot. */
  function nextPaint(): Promise<void> {
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }

  async function runCapture(rect: Rect | null, mode: CaptureMode, clipped: boolean) {
    host.style.display = 'none';
    await nextPaint();

    const context = collectContext();
    const draft = await send<DraftCreated>({ type: 'CAPTURE_AREA', rect, mode, context, clipped });

    host.style.display = '';
    if (!draft.ok) {
      toast(draft.error, 'error');
      return;
    }

    const tags = await send<string[]>({ type: 'GET_KNOWN_TAGS' });
    const form = new EvidenceForm(root, host, draft.data, tags.ok ? tags.data : []);

    let result = await form.open();
    while (result.action === 'save') {
      form.setBusy(true);
      const saved = await send<{ id: string }>({
        type: 'SAVE_EVIDENCE',
        draftId: draft.data.draftId,
        fields: result.fields,
        annotations: result.annotations,
      });
      if (saved.ok) {
        toast('Evidence saved.');
        return;
      }
      toast(saved.error, 'error');
      result = await form.reopen();
    }

    void send({ type: 'DISCARD_DRAFT', draftId: draft.data.draftId });
  }

  async function enterCaptureMode() {
    if (active) return;
    active = true;
    try {
      const selector = new ElementSelector(root, host);
      const selection = await selector.start();
      if (!selection) return;
      await runCapture(selection.rect, selection.mode, selection.clipped);
    } finally {
      active = false;
    }
  }

  async function captureVisible() {
    if (active) return;
    active = true;
    try {
      await runCapture(null, 'visible', false);
    } finally {
      active = false;
    }
  }

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === 'ENTER_CAPTURE_MODE') {
      void enterCaptureMode();
      sendResponse({ ok: true, data: null });
    } else if (message.type === 'CAPTURE_VISIBLE') {
      void captureVisible();
      sendResponse({ ok: true, data: null });
    }
    return false;
  });
}
