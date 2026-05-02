import { useState } from "react";
import { supabase } from "../supabase";

function makeCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export default function CreateRoom() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createRoom = async () => {
    setError("");
    setLoading(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const user = session?.user;
      if (!user) throw new Error("You must be signed in to create a room.");

      let created = null;
      let lastErr = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        const code = makeCode();

        const { data, error: roomError } = await supabase
          .from("rooms")
          .insert([
            {
              code,
              owner_id: user.id,
            },
          ])
          .select("*")
          .single();

        if (!roomError && data) {
          created = data;
          break;
        }

        lastErr = roomError;
      }

      if (!created) throw lastErr || new Error("Could not create room.");

      window.location.href = `/?room=${created.code}`;
    } catch (e) {
      console.error("Create room error:", e);
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <h2>Create a room</h2>

      <button onClick={createRoom} disabled={loading} style={btn}>
        {loading ? "Creating..." : "Create Room"}
      </button>

      {error ? (
        <div style={{ marginTop: 10, color: "#b00020" }}>{error}</div>
      ) : null}
    </div>
  );
}

const btn = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #111",
  background: "#111",
  color: "white",
  cursor: "pointer",
  fontWeight: 800,
};