import { useAuth } from '../lib/auth';

export function ExtensionPage() {
  const { user } = useAuth();
  return (
    <div className="doc">
      <h1>Chrome extension</h1>
      <p className="muted">The extension is where you capture; this site is where you browse and manage.</p>

      <h2>Install</h2>
      <ol>
        <li>Download or clone the repository and open the <code>extension/dist</code> folder (or run <code>npm run build:extension</code>).</li>
        <li>
          In Chrome open <code>chrome://extensions</code>, switch on <strong>Developer mode</strong>.
        </li>
        <li>
          Click <strong>Load unpacked</strong> and pick the <code>extension/dist</code> folder.
        </li>
        <li>Pin the extension from the puzzle-piece menu.</li>
      </ol>

      <h2>Connect it to this account</h2>
      <ol>
        <li>Click the extension icon → <strong>Sign in to sync</strong>.</li>
        <li>
          Enter <strong>{user?.email ?? 'your email'}</strong>. You'll get a 6-digit code by email; type it in.
        </li>
        <li>Pick the library to sync with. Anything you already captured locally is uploaded, and new captures sync automatically.</li>
      </ol>

      <h2>Capture</h2>
      <ul>
        <li>
          <strong>+ Capture Evidence</strong> → hover an element, click. Drag for a region. <kbd>↑</kbd>/<kbd>↓</kbd> picks the parent/child.
        </li>
        <li>
          <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>E</kbd> starts capture from anywhere.
        </li>
        <li>Only the observation is required; everything else is optional.</li>
      </ul>
    </div>
  );
}
