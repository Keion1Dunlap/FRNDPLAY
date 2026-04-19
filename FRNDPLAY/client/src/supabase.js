import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ✅ critical for magic links / OAuth-style redirects
    detectSessionInUrl: true,

    // ✅ keep the user logged in across refreshes
    persistSession: true,

    // ✅ keep sessions alive
    autoRefreshToken: true,

    // ✅ recommended modern flow (also supports ?code= style redirects)
    flowType: "pkce",

    // optional but nice: prevents key collisions if you run multiple supabase projects locally
    storageKey: "frndplay-auth",
  },
});
