import type { ExtensionMessage, Result } from '../types/messages';

/** Typed wrapper around runtime messaging with a uniform failure shape. */
export async function send<T>(message: ExtensionMessage): Promise<Result<T>> {
  try {
    const res = (await chrome.runtime.sendMessage(message)) as Result<T> | undefined;
    return res ?? { ok: false, error: 'The extension did not respond. Try again.' };
  } catch {
    return { ok: false, error: 'The extension is restarting. Try again in a second.' };
  }
}
