import assert from "node:assert/strict";
import test from "node:test";

import { fromSpotifyLink } from "./spotifyLink";

test("a shared playlist link becomes the URI a speaker plays", () => {
  assert.deepEqual(fromSpotifyLink("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123&pt=x"), {
    id: "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M",
    type: "playlist",
  });
});

test("the language part and surrounding spaces are ignored", () => {
  assert.deepEqual(fromSpotifyLink("  https://open.spotify.com/intl-sv/album/4aawyAB9vmqN3uQ7FjRGTy?si=x \n"), {
    id: "spotify:album:4aawyAB9vmqN3uQ7FjRGTy",
    type: "album",
  });
});

test("a track plays as music, an artist as an artist", () => {
  assert.deepEqual(fromSpotifyLink("open.spotify.com/track/11dFghVXANMlKmJXsNCbNl"), { id: "spotify:track:11dFghVXANMlKmJXsNCbNl", type: "music" });
  assert.deepEqual(fromSpotifyLink("https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF"), { id: "spotify:artist:0OdUWJ0sBjDrqHygGUXeCF", type: "artist" });
});

test("the older link with the user's name in it", () => {
  assert.deepEqual(fromSpotifyLink("https://open.spotify.com/user/spotify/playlist/37i9dQZF1DXcBWIGoYBM5M"), {
    id: "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M",
    type: "playlist",
  });
});

test("anything else is left alone", () => {
  assert.equal(fromSpotifyLink("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"), null);
  assert.equal(fromSpotifyLink("media-source://radio_browser/abc"), null);
  assert.equal(fromSpotifyLink("https://example.com/playlist/abc"), null);
  assert.equal(fromSpotifyLink("https://open.spotify.com/playlist/"), null);
});
