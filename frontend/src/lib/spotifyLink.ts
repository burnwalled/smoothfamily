// A link shared from Spotify ("Copy link to playlist") is not what a speaker is told to play:
// Home Assistant wants the URI, spotify:playlist:<id>. This turns the one into the other.

// What Home Assistant calls each kind of Spotify thing when it plays it.
const MEDIA_TYPES: Record<string, string> = {
  playlist: "playlist",
  album: "album",
  artist: "artist",
  track: "music",
  episode: "episode",
  show: "podcast",
};

export type SpotifyMedia = { id: string; type: string };

/** The URI and media type for a pasted Spotify share link, or null when the text is something else. */
export function fromSpotifyLink(text: string): SpotifyMedia | null {
  // open.spotify.com/playlist/<id>?si=…, with an optional language part (/intl-sv/) and
  // the older /user/<name>/playlist/<id> form.
  const match = text
    .trim()
    .match(/^(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(?:user\/[^/?#]+\/)?(playlist|album|artist|track|episode|show)\/([A-Za-z0-9]+)(?:[/?#].*)?$/i);
  if (!match) return null;
  const kind = match[1].toLowerCase();
  return { id: `spotify:${kind}:${match[2]}`, type: MEDIA_TYPES[kind] };
}
