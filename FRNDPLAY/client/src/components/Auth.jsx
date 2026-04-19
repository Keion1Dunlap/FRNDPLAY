// client/src/components/Auth.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

// Key where we stash a room code while user is going through email login
const PENDING_ROOM_KEY = "frndplay_pending_room_code";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  // Read ?room= from URL (if present) and normalize it
  const roomCodeFromUrl = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("room");
      return code ? String(code).trim().toUpperCase() : "";
    } catch {
      return "";
    }
  }, []);

  // If we have a room in the URL, store it so we can restore after magic-link redirect
  useEffect(() => {
    if (roomCodeFromUrl) {
      try {
        localStorage.setItem(PENDING_ROOM_KEY, roomCodeFromUrl);
      } catch {
        // ignore
      }
    }
  }, [roomCodeFromUrl]);

  // After auth completes, Supabase typically redirects to Site URL (or emailRedirectTo),
  // sometimes losing query params. If we are signed in AND there's a pending room code
  // but URL doesn't have ?room=, restore it.
  useEffect(() => {
    let ignore = false;

    const run = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const u = data?.session?.user;

        if (!u) return;

        const url = new URL(window.location.href);
        const hasRoom = url.searchParams.has("room");

        let pending = "";
        try {
          pending = localStorage.getItem(PENDING_ROOM_KEY) || "";
        } catch {
          pending = "";
        }

        // If user is signed in but URL lost ?room=, restore it
        if (!hasRoom && pending) {
          url.searchParams.set("room", pending);
          // Remove any auth hash fragments if present (optional cleanup)
          // (we keep the URL clean so reloads are stable)
          window.history.replaceState({}, "", url.toString());
        }

        // If we now have ?room= in URL, clear the pending stash
        if (url.searchParams.get("room")) {
          try {
            localStorage.removeItem(PENDING_ROOM_KEY);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    };

    run();

    // Also rerun when auth changes (magic link completes)
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (!ignore) run();
    });

    return () => {
      ignore = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const sendMagicLink = async () => {
    setMsg("");
    setSending(true);

    try {
      const em = String(email || "").trim();
      if (!em) throw new Error("Enter your email.");

      // Prefer room in URL; fallback to pending localStorage
      let pending = roomCodeFromUrl;
      if (!pending) {
        try {
          pending = localStorage.getItem(PENDING_ROOM_KEY) || "";
        } catch {
          pending = "";
        }
      }

      // Build redirect target:
      // - If joining via share link, keep ?room=CODE
      // - Otherwise just go home
      const redirectTo = pending
        ? `${window.location.origin}/?room=${encodeURIComponent(pending)}`
        : `${window.location.origin}/`;

      // Stash pending code (backup)
      if (pending) {
        try {
          localStorage.setItem(PENDING_ROOM_KEY, pending);
        } catch {
          // ignore
        }
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: em,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) throw error;

      setMsg("Check your email for the sign-in link.");
    } catch (e) {
      setMsg(String(e?.message ?? e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>
        Sign in with email (magic link)
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={sending}
          style={styles.input}
        />
        <button onClick={sendMagicLink} disabled={sending} style={styles.primaryBtn}>
          {sending ? "Sending..." : "Send sign-in link"}
        </button>
      </div>

      <div style={{ marginTop: 10, opacity: 0.75 }}>
        This version does <b>not</b> use Google OAuth.
      </div>

      {msg ? (
        <div
          style={{
            marginTop: 12,
            background: msg.toLowerCase().includes("check your email")
              ? "#f5f7ff"
              : "#fff5f5",
            border: msg.toLowerCase().includes("check your email")
              ? "1px solid #dfe6ff"
              : "1px solid #ffb3b3",
            borderRadius: 12,
            padding: 10,
            color: msg.toLowerCase().includes("check your email")
              ? "#111"
              : "#b00020",
            fontWeight: 700,
          }}
        >
          {msg}
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  input: {
    flex: 1,
    minWidth: 240,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    fontSize: 14,
  },
  primaryBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "white",
    cursor: "pointer",
    fontWeight: 900,
  },
};
