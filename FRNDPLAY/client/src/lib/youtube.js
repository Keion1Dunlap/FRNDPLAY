const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

export async function searchYouTubeSongs(query, maxResults = 6) {
  const cleanQuery = query?.trim();

  if (!cleanQuery) {
    return [];
  }

  if (!YOUTUBE_API_KEY) {
    console.error("Missing VITE_YOUTUBE_API_KEY in your .env file");
    return [];
  }

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");

    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("q", cleanQuery);
    url.searchParams.set("key", YOUTUBE_API_KEY);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!res.ok) {
      console.error("YouTube API error:", data);
      return [];
    }

    if (!Array.isArray(data.items)) {
      return [];
    }

    return data.items
      .filter((item) => item?.id?.videoId)
      .map((item) => ({
        video_id: item.id.videoId,
        title: item.snippet?.title || "Untitled video",
        thumbnail_url:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          "",
        channel_title: item.snippet?.channelTitle || "",
      }));
  } catch (err) {
    console.error("YouTube search failed:", err);
    return [];
  }
}