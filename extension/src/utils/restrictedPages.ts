/**
 * Chrome refuses to run extension scripts on a handful of URL schemes and on
 * the Web Store. Detecting these up front lets us show a human message instead
 * of a raw "Cannot access contents of url" exception.
 */

const BLOCKED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'chrome-untrusted://',
  'devtools://',
  'edge://',
  'about:',
  'view-source:',
  'data:',
  'blob:',
];

const BLOCKED_HOSTS = ['chrome.google.com', 'chromewebstore.google.com', 'addons.mozilla.org'];

export const RESTRICTED_MESSAGE =
  "This page can't be captured because of Chrome's extension restrictions. Try a regular website.";

export const FILE_URL_MESSAGE =
  'Local files need extra permission. Enable "Allow access to file URLs" for this extension in chrome://extensions and try again.';

export function restrictionReason(url: string | undefined): string | null {
  if (!url) return RESTRICTED_MESSAGE;
  const lower = url.toLowerCase();
  if (BLOCKED_PREFIXES.some((p) => lower.startsWith(p))) return RESTRICTED_MESSAGE;
  if (lower.startsWith('file:')) return FILE_URL_MESSAGE;
  try {
    const host = new URL(url).hostname;
    if (BLOCKED_HOSTS.includes(host)) return RESTRICTED_MESSAGE;
  } catch {
    return RESTRICTED_MESSAGE;
  }
  return null;
}

/** Turn a Chrome API error into something a designer can act on. */
export function friendlyError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? '');
  if (/cannot access|cannot be scripted|extensions gallery|chrome:\/\/|activeTab/i.test(text)) {
    return RESTRICTED_MESSAGE;
  }
  if (/file:/i.test(text)) return FILE_URL_MESSAGE;
  if (/no active tab|no tab with id/i.test(text)) {
    return 'No active tab found. Click on the page you want to capture and try again.';
  }
  if (/capture|screenshot|image/i.test(text)) {
    return "The screenshot couldn't be taken. Reload the page and try again.";
  }
  return 'Something went wrong. Reload the page and try again.';
}
