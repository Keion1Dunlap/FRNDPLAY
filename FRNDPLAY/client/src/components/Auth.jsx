import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export default function Auth({ setUser }) {
  const [loading, setLoading] = useState(true);

  // ✅ Check session on load
  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        setUser(data.session.user);
      }
      setLoading(false);
    };

    getSession();

    // ✅ Listen for auth changes (IMPORTANT for Google redirect)
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUser(session.user);
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [setUser]);

  // ✅ FIXED GOOGLE LOGIN (THIS IS THE IMPORTANT PART)
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin, // ✅ correct redirect
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
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background: "#0f172a",
    color: "white",
  },
  title: {
    fontSize: "32px",
    fontWeight: "bold",
    marginBottom: "8px",
  },
  subtitle: {
    marginBottom: "24px",
    opacity: 0.7,
  },
  button: {
    padding: "12px 20px",
    borderRadius: "8px",
    border: "none",
    background: "#2563eb",
    color: "white",
    fontWeight: "600",
    cursor: "pointer",
  },
};