# Music and Spotify

A flow's **Play music** step starts a playlist, an album or a radio station on one of the home's
speakers – a music alarm in a child's room, the kitchen radio when someone comes home. Smooth
Family plays through Home Assistant, so what can be played, and where, depends on how the speakers
and Spotify are connected there.

- **Pasting always works.** A share link from Spotify (`https://open.spotify.com/playlist/…`) is
  turned into the URI a speaker plays (`spotify:playlist:…`) by itself.
- **Browsing depends on the integration.** The picker shows the speaker's own library when Home
  Assistant can give it.
- **One stream per Spotify account.** Two music alarms at the same time need two accounts.

## Which integration

| | Home Assistant's Spotify | SpotifyPlus (HACS) |
| --- | --- | --- |
| Browse the library | Only while something is playing on the account | At any time |
| Devices under *Play on* | Those Spotify's web API reports – often just a TV and a computer | The home's Spotify Connect devices, found on the network: speakers, TVs, Chromecast |
| Sonos speakers | Usually missing | Listed; can need an extra step, see below |
| Installed from | Home Assistant itself | [HACS](https://hacs.xyz) |

We recommend **[SpotifyPlus](https://github.com/thlucas1/homeassistantcomponent_spotifyplus)**. The
two can be installed side by side, and Smooth Family treats both the same way: the account's player
is chosen alone in the step, and **Play on** chooses which of its devices plays.

With Home Assistant's own integration Smooth Family makes up for the first limit: it saves the
library whenever the account is playing, and shows the saved one – with its date – when the account
can't be asked.

## Set up SpotifyPlus

1. **A Spotify app.** At <https://developer.spotify.com/dashboard>, signed in with the Spotify
   account, create an app. Add the redirect URI `https://my.home-assistant.io/redirect/oauth` and
   copy the **Client ID** and **Client secret**. The app from Home Assistant's own Spotify
   integration can be reused.
2. **Install.** In Home Assistant: HACS → search for *SpotifyPlus* → Download. Restart Home
   Assistant.
3. **Add it.** Settings → Devices & services → **Add integration** → SpotifyPlus. Enter the Client
   ID and secret, sign in to Spotify and approve. Check that the right Spotify account is signed in
   in the browser first.
4. **Show it in Smooth Family.** Family settings → Connections → Smart home, and add the SpotifyPlus
   player among the devices.
5. **Use it.** In a flow, add the step Play music, choose the SpotifyPlus player, choose from the
   library and choose the speaker under **Play on**.

Adding the credentials under *Application credentials* before the integration has been added once
gives "No application_credentials platform for spotifyplus". Use **Add integration** instead, as
in step 3.

## Several in the family

A Spotify account plays one thing at a time, wherever it plays. For each person who should be able
to play at the same time as the others:

1. Create a Spotify app at <https://developer.spotify.com/dashboard> **signed in as that person**,
   with the same redirect URI.
2. In Home Assistant: Settings → Devices & services → ⋮ → Application credentials → Add. Choose
   SpotifyPlus, name it after the person and enter the app's Client ID and secret.
3. Open SpotifyPlus under Devices & services and choose **Add service**. Choose the new credentials
   and sign in to Spotify as that person – otherwise you get a second copy of your own account.
4. Add the new player in Smooth Family, and use it in that person's flows.

## Good to know

- **Play on lists devices that are on right now.** The one saved in the step stays chosen when it
  is off.
- **An account can't be combined with other speakers** in the same step; it plays on one of its own
  devices. Speakers from the Sonos or Cast integrations can be chosen together, and are grouped.
- **Sonos.** If Sonos speakers are missing under Play on, SpotifyPlus needs a token for them – see
  [its guide](https://github.com/thlucas1/homeassistantcomponent_spotifyplus/wiki). A speaker from
  Home Assistant's Sonos integration can also be chosen directly, with a pasted link.
- **Volume** is set after the music has started when an account plays, since the device may not
  exist to Spotify before that.
- **Speakers that come through another hub** (Homey, for example) can often be played on but not
  browsed. Paste a link, or add the speaker through its own integration.
