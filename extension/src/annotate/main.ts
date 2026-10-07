/**
 * Full-size annotation tab, opened from the popup's Detail screen:
 *   annotate.html?id=<evidence id>
 * Loads the item from IndexedDB, downloads the screenshot if only the
 * thumbnail is cached, runs the shared editor, saves, and closes.
 */

import { EDITOR_CSS, openAnnotationEditor } from '@shared/annotationEditor';
import { getEvidence, setAnnotations } from '../storage/evidenceStore';
import type { ExtensionMessage, Result } from '../types/messages';

const style = document.createElement('style');
style.textContent = `
  html, body { margin: 0; height: 100%; background: #e9e9ec; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111113; }
  .msg { position: fixed; inset: 0; display: grid; place-items: center; font-size: 14px; color: #4b4b54; text-align: center; padding: 20px; }
  .msg b { display: block; font-size: 16px; color: #111113; margin-bottom: 6px; }
  ${EDITOR_CSS}
  .uxa-scrim { background: #e9e9ec; }
`;
document.head.append(style);

const root = document.getElementById('root')!;

function message(title: string, body = '') {
  root.innerHTML = `<div class="msg"><div><b>${title}</b>${body}</div></div>`;
}

async function send<T>(m: ExtensionMessage): Promise<Result<T>> {
  try {
    return ((await chrome.runtime.sendMessage(m)) as Result<T>) ?? { ok: false, error: 'No response' };
  } catch {
    return { ok: false, error: 'The extension is restarting. Try again.' };
  }
}

async function closeTab() {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) await chrome.tabs.remove(tab.id);
  } catch {
    window.close();
  }
}

(async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const view: 'desktop' | 'mobile' = params.get('view') === 'mobile' ? 'mobile' : 'desktop';
  if (!id) {
    message('Nothing to annotate', 'Open an item in the extension and choose Annotate.');
    return;
  }

  message('Loading…');
  let record = await getEvidence(id);
  if (!record) {
    message('Item not found', 'It may have been deleted.');
    return;
  }
  const isMobile = view === 'mobile' && !!record.mobile;
  if (isMobile ? !record.mobileScreenshot : !record.screenshot) {
    const res = await send<boolean>({ type: 'FETCH_SCREENSHOT', id, view: isMobile ? 'mobile' : 'desktop' });
    if (res.ok) record = (await getEvidence(id)) ?? record;
  }
  const blob = isMobile ? record.mobileScreenshot ?? record.mobileThumbnail : record.screenshot ?? record.thumbnail;
  if (!blob) {
    message('Screenshot unavailable', 'Sync and try again.');
    return;
  }
  const url = URL.createObjectURL(blob);
  root.innerHTML = '';

  const result = await openAnnotationEditor({
    imageUrl: url,
    shapes: (isMobile ? record.mobile?.annotations : record.annotations) ?? [],
    viewportFraction: 0.9,
    root,
    title: `Annotate${isMobile ? ' mobile' : ''} · ${record.domain}`,
  });
  URL.revokeObjectURL(url);

  if (result) {
    await setAnnotations(id, result, isMobile ? 'mobile' : 'desktop');
    await send({ type: 'LOCAL_CHANGED' });
    message('Saved', 'You can close this tab.');
    setTimeout(closeTab, 400);
  } else {
    await closeTab();
  }
})();
