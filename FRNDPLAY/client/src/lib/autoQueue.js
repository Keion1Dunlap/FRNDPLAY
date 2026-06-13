const BAD_TITLE_WORDS = [
  "mix",
  "playlist",
  "full album",
  "album",
  "dj set",
  "live set",
  "hour",
  "hours",
  "compilation",
  "nightcore",
  "slowed",
  "reverb",
  "sped up",
  "instrumental",
  "karaoke",
  "reaction",
  "reacts",
  "reacting",
  "mashup",
  "megamix",
  "remix",
  "shorts",
  "#shorts",
  "sample",
  "craziest sample",
  "all time",
  "lyrics",
  "lyric video",
];

function isBadAutoQueueResult(video) {
  const title = video?.snippet?.title?.toLowerCase() || "";
  const channel = video?.snippet?.channelTitle?.toLowerCase() || "";

  if (!video?.id?.videoId) return true;

  if (BAD_TITLE_WORDS.some((word) => title.includes(word))) {
    return true;
  }

  if (channel.includes("topic")) {
    return false;
  }

  return false;
}

function cleanSongTitle(title = "") {
  return title
    .replace(/\(official music video\)/gi, "")
    .replace(/\[official music video\]/gi, "")
    .replace(/\(official audio\)/gi, "")
    .replace(/\[official audio\]/gi, "")
    .replace(/\(audio\)/gi, "")
    .replace(/\[audio\]/gi, "")
    .replace(/\(visualizer\)/gi, "")
    .replace(/\[visualizer\]/gi, "")
    .replace(/\(lyrics\)/gi, "")
    .replace(/\[lyrics\]/gi, "")
    .replace(/official/gi, "")
    .trim();
}

export async function findAutoQueueSong({
  seedSong,
  currentQueue = [],
  recentlyPlayed = [],
}) {
  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;

  if (!apiKey) {
    console.error("Missing VITE_YOUTUBE_API_KEY");
    return null;
  }

  if (!seedSong?.title) {
    console.warn("No seed song available for auto queue");
    return null;
  }

  const blockedVideoIds = new Set([
  seedSong.video_id || seedSong.videoId,
  ...currentQueue.map((song) => song.video_id || song.videoId),
  ...recentlyPlayed.map((song) => song.video_id || song.videoId),
].filter(Boolean));

const blockedTitles = new Set([
  seedSong.title,
  ...currentQueue.map((song) => song.title),
  ...recentlyPlayed.map((song) => song.title),
]
  .filter(Boolean)
  .map(cleanSongTitle)
  .map((title) => title.toLowerCase()));

  const cleanedTitle = cleanSongTitle(seedSong.title);

  const query = `${cleanedTitle} similar songs`;

  const url =
    "https://www.googleapis.com/youtube/v3/search" +
    `?part=snippet` +
    `&type=video` +
    `&videoCategoryId=10` +
    `&maxResults=20` +
    `&q=${encodeURIComponent(query)}` +
    `&key=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    console.error("YouTube auto queue search failed:", data);
    return null;
  }

  const candidates = data.items || [];

  const selected = candidates.find((video) => {
    const videoId = video?.id?.videoId;

    if (!videoId) return false;
    if (blockedVideoIds.has(videoId)) return false;
    if (isBadAutoQueueResult(video)) return false;

    const cleanCandidateTitle = cleanSongTitle(
  video?.snippet?.title || ""
).toLowerCase();

if (blockedTitles.has(cleanCandidateTitle)) return false;
    return true;
  });

  if (!selected) {
    console.warn("No valid auto queue result found");
    return null;
  }

  return {
    video_id: selected.id.videoId,
    title: selected.snippet.title,
    thumbnail_url:
      selected.snippet.thumbnails?.medium?.url ||
      selected.snippet.thumbnails?.default?.url ||
      "",
  };
}