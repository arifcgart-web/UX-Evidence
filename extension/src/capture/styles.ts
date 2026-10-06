/**
 * Styles for everything the content script renders. They live inside a
 * shadow root, so nothing here leaks into the host page and nothing from the
 * host page leaks in. `all: initial` on the host resets inherited properties.
 */
export const OVERLAY_CSS = /* css */ `
  :host {
    all: initial;
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    color: #111113;
    -webkit-font-smoothing: antialiased;
  }
  :host([data-mode="idle"]) { pointer-events: none; }

  *, *::before, *::after { box-sizing: border-box; }
  button, input, select, textarea { font: inherit; color: inherit; }

  /* ---------- Selection overlay ---------- */
  .uxe-overlay {
    position: fixed;
    inset: 0;
    cursor: crosshair;
    background: transparent;
  }
  .uxe-box {
    position: fixed;
    pointer-events: none;
    border: 2px solid #2563eb;
    background: rgba(37, 99, 235, 0.08);
    border-radius: 2px;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.6) inset;
    transition: top 40ms linear, left 40ms linear, width 40ms linear, height 40ms linear;
  }
  .uxe-box.region { transition: none; border-style: dashed; }
  .uxe-label {
    position: fixed;
    pointer-events: none;
    background: #111113;
    color: #fff;
    font-size: 11px;
    font-weight: 500;
    padding: 3px 7px;
    border-radius: 4px;
    white-space: nowrap;
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.01em;
  }
  .uxe-label b { font-weight: 600; color: #93c5fd; }

  .uxe-hint {
    position: fixed;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    background: #111113;
    color: #e5e7eb;
    padding: 9px 14px;
    border-radius: 999px;
    display: flex;
    gap: 14px;
    align-items: center;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    white-space: nowrap;
    pointer-events: none;
  }
  .uxe-hint span { display: inline-flex; align-items: center; gap: 6px; }
  .uxe-hint kbd {
    font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    background: #2a2a2e;
    border: 1px solid #3b3b40;
    border-bottom-width: 2px;
    color: #fff;
    padding: 3px 5px;
    border-radius: 4px;
  }

  /* ---------- Evidence form ---------- */
  .uxe-scrim {
    position: fixed;
    inset: 0;
    background: rgba(17, 17, 19, 0.35);
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 16px;
  }
  .uxe-panel {
    width: 400px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.06);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: uxe-in 140ms ease-out;
  }
  @keyframes uxe-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }

  .uxe-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #ececef;
  }
  .uxe-head h2 { margin: 0; font-size: 14px; font-weight: 600; }
  .uxe-head .uxe-source {
    font-size: 11px;
    color: #6b6b73;
    margin-top: 1px;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .uxe-iconbtn {
    appearance: none; border: 0; background: transparent; width: 28px; height: 28px;
    border-radius: 6px; display: grid; place-items: center; cursor: pointer; color: #6b6b73;
  }
  .uxe-iconbtn:hover { background: #f3f3f5; color: #111113; }

  .uxe-body { overflow-y: auto; padding: 14px 16px 4px; }

  .uxe-preview {
    position: relative;
    border: 1px solid #e5e5ea;
    border-radius: 8px;
    overflow: hidden;
    background: repeating-conic-gradient(#f6f6f8 0 25%, #fff 0 50%) 0 0 / 16px 16px;
    margin-bottom: 12px;
  }
  .uxe-preview img { display: block; width: 100%; height: auto; max-height: 220px; object-fit: contain; }
  .uxe-preview .uxe-dim {
    position: absolute; right: 6px; bottom: 6px;
    font-size: 10px; background: rgba(17,17,19,0.75); color: #fff; padding: 2px 6px; border-radius: 4px;
  }
  .uxe-clipped {
    display: flex; gap: 8px; align-items: flex-start;
    background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa;
    border-radius: 6px; padding: 8px 10px; font-size: 12px; margin-bottom: 12px;
  }

  .uxe-field { margin-bottom: 12px; }
  .uxe-label-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }
  .uxe-field label { font-size: 12px; font-weight: 500; color: #3f3f46; }
  .uxe-field .uxe-opt { font-size: 11px; color: #9a9aa3; }
  .uxe-input, .uxe-select, .uxe-textarea {
    width: 100%;
    border: 1px solid #d9d9df;
    border-radius: 6px;
    padding: 8px 10px;
    background: #fff;
    outline: none;
    transition: border-color 80ms, box-shadow 80ms;
  }
  .uxe-input:focus, .uxe-select:focus, .uxe-textarea:focus, .uxe-tags:focus-within {
    border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15);
  }
  .uxe-input.invalid { border-color: #dc2626; }
  .uxe-textarea { resize: vertical; min-height: 60px; }
  .uxe-select {
    appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b73' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
    background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px;
  }
  .uxe-error { color: #dc2626; font-size: 11px; margin-top: 4px; }

  .uxe-tags {
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    border: 1px solid #d9d9df; border-radius: 6px; padding: 6px 8px; min-height: 36px; cursor: text;
  }
  .uxe-chip {
    display: inline-flex; align-items: center; gap: 4px;
    background: #eef2ff; color: #3730a3; font-size: 12px; font-weight: 500;
    padding: 2px 4px 2px 8px; border-radius: 999px;
  }
  .uxe-chip button {
    appearance: none; border: 0; background: transparent; width: 16px; height: 16px; border-radius: 50%;
    display: grid; place-items: center; cursor: pointer; color: #6366f1; font-size: 12px; line-height: 1;
  }
  .uxe-chip button:hover { background: #c7d2fe; color: #1e1b4b; }
  .uxe-tags input { flex: 1; min-width: 80px; border: 0; outline: 0; padding: 3px 2px; background: transparent; }
  .uxe-suggest { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .uxe-suggest button {
    appearance: none; border: 1px dashed #d9d9df; background: #fff; color: #6b6b73;
    font-size: 11px; padding: 2px 8px; border-radius: 999px; cursor: pointer;
  }
  .uxe-suggest button:hover { border-color: #2563eb; color: #2563eb; }

  .uxe-toggle {
    appearance: none; border: 0; background: transparent; padding: 0; cursor: pointer;
    color: #6b6b73; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;
  }
  .uxe-toggle:hover { color: #111113; }

  .uxe-foot {
    display: flex; gap: 8px; justify-content: flex-end; align-items: center;
    padding: 12px 16px; border-top: 1px solid #ececef; background: #fafafa;
  }
  .uxe-foot .uxe-shortcut { margin-right: auto; font-size: 11px; color: #9a9aa3; }
  .uxe-btn {
    appearance: none; border: 1px solid transparent; border-radius: 7px; padding: 8px 14px;
    font-weight: 500; cursor: pointer; transition: background 80ms;
  }
  .uxe-btn.primary { background: #111113; color: #fff; }
  .uxe-btn.primary:hover { background: #2a2a2e; }
  .uxe-btn.primary:disabled { opacity: 0.6; cursor: default; }
  .uxe-btn.ghost { background: transparent; border-color: #d9d9df; color: #3f3f46; }
  .uxe-btn.ghost:hover { background: #f3f3f5; }

  /* ---------- Toast ---------- */
  .uxe-toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    background: #111113;
    color: #fff;
    padding: 10px 14px;
    border-radius: 8px;
    display: flex; align-items: center; gap: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    animation: uxe-in 140ms ease-out;
    pointer-events: none;
  }
  .uxe-toast.error { background: #b91c1c; }
  .uxe-toast svg { flex: none; }
`;
