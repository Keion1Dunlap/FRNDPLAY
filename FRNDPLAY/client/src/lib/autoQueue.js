import { searchYouTubeSongs } from "./youtube";
import {
  getNextQueuePosition,
  removeDuplicateSongsByVideoId,
} from "./queueHelpers";

export async function generateAutoQueueRows({
  room,
  queue,
  user,
  maxSearchResults = 8,
  maxSongsToAdd = 3,
}) {
  if (!room?.id) {
    console.error("generateAutoQueueRows missing room.id");
    return [];
  }

  const vibe = room?.auto_queue_vibe || "rap";
  const searchQuery = `${vibe} music popular songs`;

  const results = await searchYouTubeSongs(searchQuery, maxSearchResults);

  if (!results.length) {
    return [];
  }

  const filteredSongs = removeDuplicateSongsByVideoId(results, queue).slice(
    0,
    maxSongsToAdd
  );

  if (!filteredSongs.length) {
    return [];
  }

  const startingPosition = getNextQueuePosition(queue);

  return filteredSongs.map((song, index) => ({
    room_id: room.id,
    video_id: song.video_id,
    title: song.title,
    thumbnail_url: song.thumbnail_url,
    position: startingPosition + index,
    added_by: user?.id || null,
    source: "auto_queue",
  }));
}