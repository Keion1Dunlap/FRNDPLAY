// client/src/components/Auth.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

/**
 * Email magic-link auth (NO Google OAuth needed).
 * This avoids "Unsupported provider: provider is not enabled".
 */
export default function Auth({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let mounted = true;

    // If already signed in, notify parent
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data?.session?.user) onAuthed?.(data.session.user);
    });

    // Listen for auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) onAuthed?.(session.user);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [onAuthed]);

  const sendMagicLink = async () => {
    setMsg("");
    const trimmed = email.trim();
    if (!trimmed) {
      setMsg("Enter an email.");
      return;
    }

    try {
      setSending(true);

      // redirect back to current origin (supports any Vite port)
      const redirectTo = window.location.origin;

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;

      setMsg("✅ Check your email for the sign-in link (magic link).");
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 56, margin: "40px 0 16px" }}>FRNDPLAY</h1>

      <div style={{ marginTop: 20, maxWidth: 420 }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>
          Sign in with email (magic link)
        </label>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ddd",
            marginBottom: 12,
          }}
        />

        <button
          onClick={sendMagicLink}
          disabled={sending}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "none",
            background: "black",
            color: "white",
            fontWeight: 800,
            cursor: sending ? "not-allowed" : "pointer",
            opacity: sending ? 0.7 : 1,
          }}
        >
          {sending ? "Sending..." : "Send sign-in link"}
        </button>

        {msg ? (
          <div style={{ marginTop: 12, color: "#333", whiteSpace: "pre-wrap" }}>
            {msg}
          </div>
        ) : null}

        <div style={{ marginTop: 18, fontSize: 13, color: "#666" }}>
          This version does <b>not</b> use Google OAuth.
        </div>
      </div>
    </div>
  );
}
