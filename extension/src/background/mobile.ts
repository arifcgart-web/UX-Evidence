/**
 * Phone-width capture via the Chrome DevTools Protocol.
 *
 * `chrome.debugger` lets us emulate a phone viewport on the current tab
 * (responsive CSS kicks in exactly as in DevTools device mode) and take a
 * screenshot of that emulated viewport. Chrome shows a small "is debugging
 * this browser" bar while attached; we detach as soon as the capture is done.
 */

import { MOBILE_VIEWPORT } from '@shared/evidence';
import { processCapture } from '../utils/image';
import { attachMobile, detachMobile } from '../storage/evidenceStore';

const PROTOCOL = '1.3';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/** Tabs we are currently emulating via the debugger. */
const attached = new Set<number>();

/**
 * Fallback when the debugger can't attach (commonly because another extension
 * has injected frames into the page): narrow the browser window itself to
 * phone width, capture with captureVisibleTab, then restore the window.
 */
interface WindowMode {
  windowId: number;
  bounds: { left?: number; top?: number; width?: number; height?: number };
  state: chrome.windows.windowStateEnum | undefined;
}
const resized = new Map<number, WindowMode>();

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId !== undefined) attached.delete(source.tabId);
});

function cmd<T = unknown>(tabId: number, method: string, params?: object): Promise<T> {
  return chrome.debugger.sendCommand({ tabId }, method, params) as Promise<T>;
}

export type MobileMode = 'emulate' | 'window';

/**
 * Switch the tab to a phone-sized view. Tries device emulation first; if
 * Chrome won't let us attach, narrows the window instead.
 * `chromeWidth` = window outer width minus the page's inner width (borders, scrollbar).
 */
export async function enterMobile(
  tabId: number,
  windowId: number | undefined,
  chromeWidth: number,
): Promise<{ width: number; height: number; mode: MobileMode }> {
  try {
    const size = await enterEmulation(tabId);
    return { ...size, mode: 'emulate' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/already attached/i.test(msg)) {
      throw new Error('Close DevTools on this tab first, then try the mobile view again.');
    }
    console.warn('[ux-evidence] emulation unavailable, narrowing the window instead:', msg);
    if (windowId === undefined) throw new Error(`Couldn't switch this page to a mobile view (${msg}).`);
    await enterWindowMode(tabId, windowId, chromeWidth);
    return { width: MOBILE_VIEWPORT.width, height: MOBILE_VIEWPORT.height, mode: 'window' };
  }
}

async function enterEmulation(tabId: number): Promise<{ width: number; height: number }> {
  if (!attached.has(tabId)) {
    await chrome.debugger.attach({ tabId }, PROTOCOL);
    attached.add(tabId);
  }
  const { width, height, deviceScaleFactor } = MOBILE_VIEWPORT;
  try {
    await cmd(tabId, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile: true,
      screenWidth: width,
      screenHeight: height,
    });
  } catch (error) {
    await chrome.debugger.detach({ tabId }).catch(() => undefined);
    attached.delete(tabId);
    throw error;
  }
  await cmd(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }).catch(() => undefined);
  await cmd(tabId, 'Emulation.setUserAgentOverride', { userAgent: IPHONE_UA, platform: 'iPhone' }).catch(() => undefined);
  return { width, height };
}

async function enterWindowMode(tabId: number, windowId: number, chromeWidth: number): Promise<void> {
  const win = await chrome.windows.get(windowId);
  resized.set(tabId, {
    windowId,
    bounds: { left: win.left, top: win.top, width: win.width, height: win.height },
    state: win.state,
  });
  if (win.state && win.state !== 'normal') {
    await chrome.windows.update(windowId, { state: 'normal' });
  }
  // Chrome enforces a minimum window width; whatever we get is still a narrow, mobile-style layout.
  await chrome.windows.update(windowId, { width: Math.max(0, Math.round(MOBILE_VIEWPORT.width + chromeWidth)) });
}

export async function exitMobile(tabId: number): Promise<void> {
  const win = resized.get(tabId);
  if (win) {
    resized.delete(tabId);
    if (win.state && win.state !== 'normal' && win.state !== 'minimized') {
      await chrome.windows.update(win.windowId, { state: win.state }).catch(() => undefined);
    } else {
      await chrome.windows.update(win.windowId, { ...win.bounds, state: 'normal' }).catch(() => undefined);
    }
  }
  if (!attached.has(tabId)) return;
  await cmd(tabId, 'Emulation.clearDeviceMetricsOverride').catch(() => undefined);
  await cmd(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => undefined);
  await cmd(tabId, 'Emulation.setUserAgentOverride', { userAgent: '' }).catch(() => undefined);
  await chrome.debugger.detach({ tabId }).catch(() => undefined);
  attached.delete(tabId);
}

export interface MobilePreview {
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
}

/** Screenshot the emulated viewport, crop to the selection and attach it to the draft. */
export async function captureMobile(
  tabId: number,
  draftId: string,
  rect: { x: number; y: number; width: number; height: number } | null,
  viewport: { width: number; height: number },
): Promise<MobilePreview> {
  let dataUrl: string;
  const win = resized.get(tabId);
  if (attached.has(tabId)) {
    const shot = await cmd<{ data: string }>(tabId, 'Page.captureScreenshot', { format: 'png', fromSurface: true });
    dataUrl = `data:image/png;base64,${shot.data}`;
  } else if (win) {
    dataUrl = await chrome.tabs.captureVisibleTab(win.windowId, { format: 'png' });
  } else {
    throw new Error('The mobile view was closed. Try again.');
  }
  const processed = await processCapture(dataUrl, rect, viewport);
  const saved = await attachMobile(draftId, {
    screenshot: processed.screenshot,
    thumbnail: processed.thumbnail,
    width: processed.width,
    height: processed.height,
    viewport,
  });
  if (!saved) throw new Error('This capture expired. Please capture it again.');
  return { previewUrl: processed.previewUrl, previewWidth: processed.previewWidth, previewHeight: processed.previewHeight };
}

export async function removeMobile(id: string): Promise<void> {
  await detachMobile(id);
}
