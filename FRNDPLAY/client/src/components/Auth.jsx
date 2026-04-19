import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

const PENDING_ROOM_KEY = "frndplay_pending_room_code";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  const roomCodeFromUrl = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("room");
      return code ? String(code).trim().toUpperCase() : "";
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    if (roomCodeFromUrl) {
      try {
        localStorage.setItem(PENDING_ROOM_KEY, roomCodeFromUrl);
      } catch {}
    }
  }, [roomCodeFromUrl]);

  // ✅ FIXED: handles BOTH ?code AND #access_token flows
  useEffect(() => {
    let ignore = false;

    const finishAuthRedirect = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        // If session exists → clean URL
        if (data?.session) {
          const url = new URL(window.location.href);

          url.hash = ""; // removes #access_token etc
          url.searchParams.delete("code");
          url.searchParams.delete("type");

          window.history.replaceState({}, "", url.toString());
        }
      } catch (e) {
        if (!ignore) {
          setMsg(String(e?.message ?? e));
        }
      }
    };

    finishAuthRedirect();

    return () => {
      ignore = true;
    };
  }, []);

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

        if (!hasRoom && pending) {
          url.searchParams.set("room", pending);
          window.history.replaceState({}, "", url.toString());
        }

        if (url.searchParams.get("room")) {
          try {
            localStorage.removeItem(PENDING_ROOM_KEY);
          } catch {}
        }
      } catch {}
    };

    run();

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

      let pending = roomCodeFromUrl;
      if (!pending) {
        try {
          pending = localStorage.getItem(PENDING_ROOM_KEY) || "";
        } catch {
          pending = "";
        }
      }

      const redirectTo = pending
        ? `${window.location.origin}/?room=${encodeURIComponent(pending)}`
        : `${window.location.origin}/`;

      if (pending) {
        try {
          localStorage.setItem(PENDING_ROOM_KEY, pending);
        } catch {}
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