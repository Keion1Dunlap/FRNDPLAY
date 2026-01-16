import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY, // IMPORTANT: publishable (anon) key, not service role
  { auth: { persistSession: false } }
);

// Usage:
//   node get-token.js you@example.com yourPassword
// You can also set TEST_EMAIL / TEST_PASSWORD in your shell for convenience,
// but do NOT commit those to git.
const email = process.argv[2] || process.env.TEST_EMAIL;
const password = process.argv[3] || process.env.TEST_PASSWORD;

if (!email || !password) {
  console.error("Missing credentials. Run: node get-token.js <email> <password>");
  process.exit(1);
}

const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});

if (error) {
  console.error("Login failed:", error.message);
  process.exit(1);
}

console.log("ACCESS_TOKEN:", data.session.access_token);
