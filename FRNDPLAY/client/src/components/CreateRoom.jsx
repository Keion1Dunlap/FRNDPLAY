// client/src/components/CreateRoom.jsx
import { useState } from "react";
import { supabase } from "../supabaseClient";

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
      if (!user) throw new Error("You must be signed in to create a room.");

      // Try a few times in case code collides with an existing one
      let room = null;
      let lastErr = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        const code = makeCode();

        const { data, error: roomError } = await supabase
          .from("rooms")
          .insert([{ code, owner_id: user.id }]) // <-- keep your schema choice
          .select("*")
          .single();

        if (!roomError && data) {
          room = data;
          break;
        }

        lastErr = roomError;

        // If it's NOT a unique constraint collision, don't keep retrying
        const msg = (roomError?.message || "").toLowerCase();
        const isUniqueCollision =
          msg.includes("duplicate") ||
          msg.includes("unique") ||
          msg.includes("rooms_code") ||
          msg.includes("code");

        if (!isUniqueCollision) break;
      }

      if (!room) throw lastErr || new Error("Failed to create room.");

      // Add creator as host (if you already have an auto-add trigger, this will just upsert)
      const { error: memberError } = await supabase
        .from("room_members")
        .upsert([{ room_id: room.id, user_id: user.id, role: "host" }], {
          onConflict: "room_id,user_id",
        });

      if (memberError) throw memberError;

      setRoom(room);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to create room");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={createRoom} disabled={loading || !user}>
        {loading ? "Creating..." : "Create Room"}
      </button>

      {error ? <div className="error">{error}</div> : null}
    </>
  );
}
