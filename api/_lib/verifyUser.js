// Shared helper — NOT a public route (Vercel ignores files/folders starting
// with "_" when building serverless routes, so this file is safe to keep
// inside /api without becoming its own accidental endpoint).
//
// Every endpoint that costs money (Places search, PageSpeed check) or
// touches billing must call verifyUser() first. Without this, anyone who
// finds the endpoint URL could hammer it directly and burn through your
// Google API quota or spam Razorpay order creation — completely bypassing
// the app and the free-tier gating in the UI.
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Verifies the Supabase access token sent by the browser and returns the
// real, authenticated user — never trust a userId sent in the request body,
// always derive it from this.
async function verifyUser(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return data.user;
  } catch (e) {
    console.error('verifyUser error:', e);
    return null;
  }
}

module.exports = { verifyUser, supabaseAdmin };
