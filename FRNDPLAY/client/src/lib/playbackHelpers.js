import { supabase } from "../supabase.js";
import { searchYouTubeSongs } from "./youtube";

function isValidYouTubeId(value) {
  return /^[a-zA-Z0-9_-]{11}$/.test(String(value || "").trim());
}

export async function savePlayedSong({ roomId, song }) {
  if (!roomId || !song?.video_id) return;

  const { error } = await supabase.from("played_items").insert({
    room_id: String(roomId),
    video_id: song.video_id,
    title: song.title || "Untitled video",
    thumbnail: song.thumbnail || song.thumbnail_url || "",
    source: song.source || "user",
  });

  if (error) {
    console.error("Save played song failed:", error);
  }
}

export async function getRecentPlayedSongs(roomId, limit = 5) {
  if (!roomId) return [];

  const { data, error } = await supabase
    .from("played_items")
    .select("*")
    .eq("room_id", String(roomId))
    .order("played_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Load played history failed:", error);
    return [];
  }

  return data || [];
}

export async function getNextQueueSong(roomId) {
  if (!roomId) return null;

  const { data, error } = await supabase
    .from("room_queue")
    .select("*")
    .eq("room_id", String(roomId))
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Get next queue song failed:", error);
    return null;
  }

  return data;
}

export async function removeQueueSong(songId) {
  if (!songId) return;

  const { error } = await supabase
    .from("room_queue")
    .delete()
    .eq("id", songId);

  if (error) {
    console.error("Remove queue song failed:", error);
  }
}

export async function generateSongFromHistory({ roomId, vibe = "rap" }) {
  const history = await getRecentPlayedSongs(roomId, 5);

  let searchQuery = `${vibe} music popular songs`;

  if (history.length > 0) {
    const seedTitles = history
      .map((song) => song.title)
      .filter(Boolean)
      .slice(0, 3)
      .join(" ");

    searchQuery = `${seedTitles} similar songs`;
  }

  const results = await searchYouTubeSongs(searchQuery, 8);

  if (!results.length) return null;

  const playedIds = new Set(history.map((song) => song.video_id));

  const nextSong = results.find(
    (song) => isValidYouTubeId(song.video_id) && !playedIds.has(song.video_id)
  );

  if (!nextSong) return null;

  return {
    video_id: nextSong.video_id,
    title: nextSong.title || "Untitled video",
    thumbnail: nextSong.thumbnail_url || "",
    source: "auto_queue",
  };
}