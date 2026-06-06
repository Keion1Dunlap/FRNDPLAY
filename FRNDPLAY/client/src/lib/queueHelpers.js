export function getNextQueuePosition(queue = []) {
  if (!Array.isArray(queue) || queue.length === 0) {
    return 1;
  }

  const positions = queue
    .map((song) => Number(song.position))
    .filter((position) => !Number.isNaN(position));

  if (positions.length === 0) {
    return queue.length + 1;
  }

  return Math.max(...positions) + 1;
}

export function removeDuplicateSongsByVideoId(songs = [], existingQueue = []) {
  const existingVideoIds = new Set(
    existingQueue
      .map((song) => song.video_id)
      .filter(Boolean)
  );

  return songs.filter((song) => {
    if (!song?.video_id) return false;
    return !existingVideoIds.has(song.video_id);
  });
}