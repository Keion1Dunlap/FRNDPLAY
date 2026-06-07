import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export default function Auth({ setUser }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (data?.session?.user) {
        setUser(data.session.user);

        const pendingPath = sessionStorage.getItem("frndplay_pending_path");

        if (pendingPath) {
          sessionStorage.removeItem("frndplay_pending_path");

          if (window.location.pathname !== pendingPath) {
            window.location.href = pendingPath;
            return;
          }
        }
      }

      setLoading(false);
    };

    handleSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUser(session.user);

          const pendingPath = sessionStorage.getItem("frndplay_pending_path");

          if (pendingPath) {
            sessionStorage.removeItem("frndplay_pending_path");

            if (window.location.pathname !== pendingPath) {
              window.location.href = pendingPath;
            }
          }
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [setUser]);

  const signInWithGoogle = async () => {
    const currentPath =
      window.location.pathname + window.location.search + window.location.hash;

    // Save the page/room the user was trying to access before Google redirects
    sessionStorage.setItem("frndplay_pending_path", currentPath);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Send them back to the exact page they started from
        redirectTo: `${window.location.origin}${currentPath}`,
      },
    });

    if (error) {
      console.error("Google login error:", error.message);
    }
  };

  if (loading) return null;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>FRNDPLAY</h1>
      <p style={styles.subtitle}>Social listening</p>

      <button onClick={signInWithGoogle} style={styles.button}>
        Continue with Google
      </button>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background:
      "radial-gradient(circle at top left, #1d4ed8 0, transparent 35%), linear-gradient(135deg, #020617 0%, #0f172a 55%, #111827 100%)",
    color: "white",
    padding: "24px",
  },
  title: {
    fontSize: "38px",
    fontWeight: "900",
    marginBottom: "8px",
    letterSpacing: "-1px",
  },
  subtitle: {
    marginBottom: "24px",
    opacity: 0.75,
    fontWeight: "600",
  },
  button: {
    padding: "14px 22px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "#2563eb",
    color: "white",
    fontWeight: "800",
    cursor: "pointer",
    boxShadow: "0 12px 30px rgba(37,99,235,0.35)",
  },
};