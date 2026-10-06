/** Rendered instead of the app when the Supabase env vars are missing. */
export function SetupPage() {
  return (
    <div className="setup">
      <div className="setup-card">
        <h1>Almost there</h1>
        <p>
          This deployment has no Supabase credentials yet, so there is nothing to sign in to. Add two environment
          variables and redeploy:
        </p>
        <pre>
          VITE_SUPABASE_URL=https://&lt;project-ref&gt;.supabase.co{'\n'}
          VITE_SUPABASE_ANON_KEY=&lt;anon public key&gt;
        </pre>
        <ol>
          <li>Supabase dashboard → Project Settings → API: copy the URL and the <em>anon public</em> key.</li>
          <li>Netlify → Site configuration → Environment variables → add both.</li>
          <li>Deploys → Trigger deploy → Clear cache and deploy site.</li>
        </ol>
        <p className="muted">Running locally? Copy <code>web/.env.example</code> to <code>web/.env</code>.</p>
      </div>
    </div>
  );
}
