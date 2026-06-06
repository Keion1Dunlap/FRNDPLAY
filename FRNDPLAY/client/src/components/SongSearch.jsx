import { useEffect, useState } from "react";
import { searchYouTubeSongs } from "../lib/youtube";

export default function SongSearch({ onAddSong }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const delaySearch = setTimeout(async () => {
      try {
        setIsSearching(true);

        const results = await searchYouTubeSongs(searchTerm, 6);

        setSearchResults(results);
      } catch (err) {
        console.error("Live search error:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(delaySearch);
  }, [searchTerm]);

  function handleAddSong(song) {
    if (typeof onAddSong !== "function") {
      console.error("SongSearch is missing onAddSong prop");
      return;
    }

    onAddSong(song);
    setSearchTerm("");
    setSearchResults([]);
  }

  return (
    <div className="song-search-box">
      <input
        type="text"
        placeholder="Search for a song..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {isSearching && (
        <p className="search-status">Searching...</p>
      )}

      {searchResults.length > 0 && (
        <div className="search-results">
          {searchResults.map((song) => (
            <div key={song.video_id} className="search-result">
              {song.thumbnail_url && (
                <img
                  src={song.thumbnail_url}
                  alt={song.title}
                  className="search-result-thumbnail"
                />
              )}

              <div className="search-result-info">
                <p>{song.title}</p>

                {song.channel_title && (
                  <span>{song.channel_title}</span>
                )}
              </div>

              <button type="button" onClick={() => handleAddSong(song)}>
                Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}