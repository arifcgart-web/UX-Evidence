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

/** Tabs we are currently emulating. */
const attached = new Set<number>();

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId !== undefined) attached.delete(source.tabId);
});

function cmd<T = unknown>(tabId: number, method: string, params?: object): Promise<T> {
  return chrome.debugger.sendCommand({ tabId }, method, params) as Promise<T>;
}

export async function enterMobile(tabId: number): Promise<{ width: number; height: number }> {
  if (!attached.has(tabId)) {
    try {
      await chrome.debugger.attach({ tabId }, PROTOCOL);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/already attached/i.test(msg)) {
        throw new Error('Close DevTools on this tab first, then try the mobile view again.');
      }
      throw new Error("Couldn't switch this page to a mobile view.");
    }
    attached.add(tabId);
  }
  const { width, height, deviceScaleFactor } = MOBILE_VIEWPORT;
  await cmd(tabId, 'Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
  });
  await cmd(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }).catch(() => undefined);
  await cmd(tabId, 'Emulation.setUserAgentOverride', { userAgent: IPHONE_UA, platform: 'iPhone' }).catch(() => undefined);
  return { width, height };
}

export async function exitMobile(tabId: number): Promise<void> {
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
  if (!attached.has(tabId)) throw new Error('The mobile view was closed. Try again.');
  const shot = await cmd<{ data: string }>(tabId, 'Page.captureScreenshot', { format: 'png', fromSurface: true });
  const processed = await processCapture(`data:image/png;base64,${shot.data}`, rect, viewport);
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

export async function removeMobile(draftId: string): Promise<void> {
  await detachMobile(draftId);
}
