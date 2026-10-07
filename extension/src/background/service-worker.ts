/**
 * Service worker — the only context that talks to privileged Chrome APIs and
 * to the network.
 *
 * Responsibilities:
 *   - inject the content script on demand (never declared for all URLs)
 *   - take the viewport screenshot and crop it
 *   - persist drafts / saved evidence
 *   - route typed messages between popup and content script
 *   - sign in, push/pull cloud sync (sync/)
 */

import type { DraftCreated, ExtensionMessage, Result } from '../types/messages';
import { fail, ok } from '../types/messages';
import {
  collectTags,
  commitDraft,
  createDraft,
  deleteEvidence,
  getEvidence,
  listEvidence,
  newId,
  sweepStaleDrafts,
} from '../storage/evidenceStore';
import { metaGet } from '../storage/db';
import { processCapture } from '../utils/image';
import { captureMobile, enterMobile, exitMobile, removeMobile } from './mobile';
import { friendlyError, restrictionReason } from '../utils/restrictedPages';
import {
  addCategory,
  adoptSession,
  adoptTokenHash,
  fetchScreenshot,
  getCategories,
  getStatus,
  refreshLibraries,
  requestCode,
  setActiveLibrary,
  signOut,
  syncNow,
  verifyCode,
} from '../sync/sync';
import { isConfigured, setConfig } from '../sync/client';
import { META_ACTIVE_LIBRARY } from '../sync/keys';

const CONTENT_SCRIPT = 'content.js';
const SYNC_ALARM = 'uxe-sync';

// ---------------------------------------------------------------------------
// Tab helpers
// ---------------------------------------------------------------------------

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  return tab;
}

/**
 * Inject the capture script if the page does not have it yet. The script
 * itself guards against double initialisation, so calling this twice is safe.
 */
async function ensureContentScript(tabId: number): Promise<void> {
  const [probe] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => Boolean((window as unknown as { __uxEvidenceLoaded?: boolean }).__uxEvidenceLoaded),
  });
  if (probe?.result === true) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
}

async function startCapture(mode: 'element' | 'visible'): Promise<Result<null>> {
  try {
    const tab = await getActiveTab();
    const reason = restrictionReason(tab.url);
    if (reason) return fail(reason);

    const tabId = tab.id!;
    await ensureContentScript(tabId);

    const message: ExtensionMessage =
      mode === 'visible' ? { type: 'CAPTURE_VISIBLE' } : { type: 'ENTER_CAPTURE_MODE' };
    await chrome.tabs.sendMessage(tabId, message);
    return ok(null);
  } catch (error) {
    console.warn('[ux-evidence] startCapture failed', error);
    return fail(friendlyError(error));
  }
}

// ---------------------------------------------------------------------------
// Capture pipeline
// ---------------------------------------------------------------------------

async function captureArea(
  message: Extract<ExtensionMessage, { type: 'CAPTURE_AREA' }>,
  sender: chrome.runtime.MessageSender,
): Promise<Result<DraftCreated>> {
  try {
    const windowId = sender.tab?.windowId;
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId as number, { format: 'png' });
    if (!dataUrl) throw new Error('capture returned no image');

    const processed = await processCapture(dataUrl, message.rect, message.context.viewport);

    const draft = await createDraft({
      id: newId(),
      screenshot: processed.screenshot,
      thumbnail: processed.thumbnail,
      screenshotWidth: processed.width,
      screenshotHeight: processed.height,
      captureMode: message.mode,
      context: message.context,
    });

    return ok({
      draftId: draft.id,
      previewUrl: processed.previewUrl,
      previewWidth: processed.previewWidth,
      previewHeight: processed.previewHeight,
      context: message.context,
      categories: await getCategories().catch(() => []),
      clipped: message.clipped,
    });
  } catch (error) {
    console.warn('[ux-evidence] captureArea failed', error);
    return fail(friendlyError(error));
  }
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

async function handle(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<Result<unknown>> {
  switch (message.type) {
    case 'START_CAPTURE':
      return startCapture(message.mode);

    case 'CAPTURE_AREA':
      return captureArea(message, sender);

    case 'SAVE_EVIDENCE': {
      try {
        const saved = await commitDraft(message.draftId, message.fields, message.annotations, message.mobileAnnotations);
        if (!saved) return fail('This capture expired. Please capture it again.');
        void syncNow();
        return ok({ id: saved.id });
      } catch (error) {
        console.warn('[ux-evidence] save failed', error);
        return fail("The evidence couldn't be saved. Please try again.");
      }
    }

    case 'DISCARD_DRAFT': {
      await deleteEvidence(message.draftId).catch(() => undefined);
      return ok(null);
    }

    case 'GET_KNOWN_TAGS': {
      try {
        const active = (await metaGet<string>(META_ACTIVE_LIBRARY)) ?? null;
        return ok(collectTags(await listEvidence(active)));
      } catch {
        return ok([]);
      }
    }

    // ---- sync & account ----
    case 'SYNC_STATUS':
      return ok(await getStatus());

    case 'SET_CLOUD_CONFIG':
      try {
        await setConfig(message.config);
        if (message.config) chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 15 });
        return ok(await getStatus());
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }

    case 'SYNC_NOW':
      return ok(await syncNow());

    case 'LOCAL_CHANGED':
      void syncNow();
      return ok(null);

    case 'AUTH_REQUEST_CODE':
      try {
        await requestCode(message.email);
        return ok(null);
      } catch (error) {
        return fail(authError(error));
      }

    case 'AUTH_VERIFY_CODE':
      try {
        await verifyCode(message.email, message.code);
        return ok(await getStatus());
      } catch (error) {
        return fail(authError(error));
      }

    case 'AUTH_SIGN_OUT':
      await signOut();
      return ok(await getStatus());

    case 'SET_LIBRARY':
      await setActiveLibrary(message.libraryId);
      return ok(await getStatus());

    case 'REFRESH_LIBRARIES':
      try {
        await refreshLibraries();
        return ok(await getStatus());
      } catch (error) {
        return fail(authError(error));
      }

    case 'MOBILE_ENTER': {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return fail('No tab to switch.');
      try {
        return ok(await enterMobile(tabId, sender.tab?.windowId, message.chromeWidth ?? 16));
      } catch (error) {
        await exitMobile(tabId);
        return fail(error instanceof Error ? error.message : "Couldn't switch to a mobile view.");
      }
    }

    case 'MOBILE_EXIT': {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) await exitMobile(tabId);
      return ok(null);
    }

    case 'MOBILE_CAPTURE': {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return fail('No tab to capture.');
      try {
        const preview = await captureMobile(tabId, message.draftId, message.rect, message.viewport);
        // Added to an item that's already in the library → upload it now.
        const rec = await getEvidence(message.draftId);
        if (rec?.status === 'saved') void syncNow();
        return ok(preview);
      } catch (error) {
        return fail(error instanceof Error ? error.message : "The mobile view couldn't be captured.");
      }
    }

    case 'MOBILE_REMOVE': {
      await removeMobile(message.draftId);
      const rec = await getEvidence(message.draftId);
      if (rec?.status === 'saved') void syncNow();
      return ok(null);
    }

    case 'START_MOBILE_FOR':
      try {
        const tab = await getActiveTab();
        const reason = restrictionReason(tab.url);
        if (reason) return fail(reason);
        await ensureContentScript(tab.id!);
        await chrome.tabs.sendMessage(tab.id!, { type: 'ADD_MOBILE', evidenceId: message.evidenceId } satisfies ExtensionMessage);
        return ok(null);
      } catch (error) {
        return fail(friendlyError(error));
      }

    case 'ADD_CATEGORY':
      try {
        return ok(await addCategory(message.name));
      } catch (error) {
        return fail(error instanceof Error ? error.message : "The category couldn't be added.");
      }

    case 'FETCH_SCREENSHOT':
      try {
        return ok(await fetchScreenshot(message.id, message.view ?? 'desktop'));
      } catch {
        return fail("Couldn't download the screenshot. Check your connection.");
      }

    // Worker -> content messages never arrive here; listed for exhaustiveness.
    case 'ENTER_CAPTURE_MODE':
    case 'CAPTURE_VISIBLE':
    case 'ADD_MOBILE':
      return fail('Unexpected message direction.');
  }
}

function authError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/not configured/i.test(text)) return 'Cloud sync is not set up in this build.';
  if (/rate limit|too many/i.test(text)) return 'Too many attempts. Wait a few minutes and try again.';
  if (/invalid|expired|Token has expired/i.test(text)) return 'That code is wrong or has expired. Request a new one.';
  if (/fetch|network/i.test(text)) return 'No connection. Check your network and try again.';
  return text;
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse: (r: Result<unknown>) => void) => {
    handle(message, sender)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse(fail(friendlyError(error))));
    return true; // keep the channel open for the async response
  },
);

/**
 * Sign-in hand-over from the web app. The web app (listed in the manifest's
 * `externally_connectable`) sends the session it already holds, so the user
 * never needs a second email. The payload also carries the project URL/key, so
 * a fresh extension can be fully configured in one click.
 */
interface HandoverMessage {
  type: 'UXE_HANDOVER';
  supabaseUrl: string;
  anonKey: string;
  /** Preferred: one-time token the extension exchanges for its own session. */
  tokenHash?: string;
  /** Legacy (older web app builds): the web app's own tokens. */
  accessToken?: string;
  refreshToken?: string;
}

chrome.runtime.onMessageExternal.addListener(
  (message: HandoverMessage, sender, sendResponse: (r: Result<unknown>) => void) => {
    (async () => {
      if (!message || message.type !== 'UXE_HANDOVER') return fail('Unknown message');
      if (!sender.origin || !/^https:\/\//.test(sender.origin)) return fail('Untrusted origin');
      try {
        await setConfig({ url: message.supabaseUrl, anonKey: message.anonKey });
        if (message.tokenHash) await adoptTokenHash(message.tokenHash);
        else if (message.accessToken && message.refreshToken) await adoptSession(message.accessToken, message.refreshToken);
        else return fail('Nothing to sign in with. Update the web app and try again.');
        chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 15 });
        return ok(await getStatus());
      } catch (error) {
        return fail(authError(error));
      }
    })()
      .then(sendResponse)
      .catch((error: unknown) => sendResponse(fail(friendlyError(error))));
    return true;
  },
);

// Keyboard shortcut (Cmd/Ctrl+Shift+E). Chrome grants activeTab for commands,
// so this needs no extra permission.
chrome.commands.onCommand.addListener((command) => {
  if (command === 'start-capture') void startCapture('visible');
});

// Housekeeping + background sync
function onStart() {
  void sweepStaleDrafts();
  void isConfigured().then((configured) => {
    if (!configured) return;
    chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 15 });
    void syncNow();
  });
}
chrome.runtime.onStartup.addListener(onStart);
chrome.runtime.onInstalled.addListener(onStart);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) void syncNow();
});
