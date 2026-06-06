export default function QueueSongItem({
  song,
  isHost,
  onPlaySong,
  onDeleteSong,
}) {
  if (!song) return null;

  function handlePlay() {
    if (typeof onPlaySong !== "function") {
      console.error("QueueSongItem is missing onPlaySong prop");
      return;
    }

    onPlaySong(song);
  }

  function handleDelete() {
    if (typeof onDeleteSong !== "function") return;
    onDeleteSong(song);
  }

  return (
    <div className="queue-song">
      {song.thumbnail_url && (
        <img
          src={song.thumbnail_url}
          alt={song.title}
          className="queue-song-thumbnail"
        />
      )}

      <div className="queue-song-info">
        <p>{song.title}</p>

        {song.source === "auto_queue" && (
          <span className="auto-queue-badge">
            Auto Queue
          </span>
        )}
      </div>

      {isHost && (
        <div className="queue-song-actions">
          <button type="button" onClick={handlePlay}>
            Play
          </button>

          {onDeleteSong && (
            <button type="button" onClick={handleDelete}>
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}