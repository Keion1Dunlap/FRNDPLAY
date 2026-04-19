// client/src/components/CreateRoom.jsx
import { useState } from "react";
import { supabase } from "../supabase";

function makeCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function CreateRoom({ user, setRoom }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createRoom = async () => {
    setError("");
    setLoading(true);

    try {
      if (!user?.id) throw new Error("You must be signed in to create a room.");

      // Try a few times in case code collides with an existing one
      let created = null;
      let lastErr = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        const code = makeCode();

        const { data, error: roomError } = await supabase
          .from("rooms")
          .insert([{ code, owner_id: user.id }])
          .select("*")
          .single();

        if (!roomError && data) {
          created = data;
          break;
        }
        lastErr = roomError;
      }

      if (!created) throw lastErr || new Error("Could not create room.");

      // IMPORTANT:
      // Do NOT insert into room_members here.
      // Your DB trigger (add_host_member_on_room_create) should add the host automatically.
      setRoom(created);
    } catch (e) {
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
      {error ? <div style={{ marginTop: 10, color: "#b00020" }}>{error}</div> : null}
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
