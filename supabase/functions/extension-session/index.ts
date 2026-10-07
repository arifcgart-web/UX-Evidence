// Supabase Edge Function: extension-session
//
// Gives the Chrome extension its OWN login session instead of a copy of the
// web app's. Sharing one session made both sides log out: whenever one side
// refreshed its token, the other side's token became "already used" and
// Supabase revoked the whole session.
//
// Flow: the signed-in web app calls this function → we check who is calling →
// we create a one-time sign-in token for that same user (no email is sent) →
// the web app passes it to the extension → the extension exchanges it for a
// fresh, independent session.
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function →
// Via Editor → name it `extension-session` → paste this file → Deploy.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Not signed in' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Who is asking? (validates the caller's access token)
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const email = userData?.user?.email;
  if (userError || !email) return json({ error: 'Not signed in' }, 401);

  // One-time token for the same user. generateLink does not send an email.
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data?.properties?.hashed_token) {
    return json({ error: error?.message ?? 'Could not create a sign-in token' }, 500);
  }
  return json({ token_hash: data.properties.hashed_token });
});
