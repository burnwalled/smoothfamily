# Smooth Family – Home Assistant add-on

Lets the family's Smooth Family server reach the Home Assistant in another home – the cabin, the
summer house – without opening any port there. It works behind 4G routers and CGNAT.

The gateway runs next to that home's Home Assistant and calls the Smooth Family server over HTTPS,
keeping a websocket open. How it runs depends on how Home Assistant is installed (**Settings →
About** shows the installation type):

| Installation type | The gateway |
|---|---|
| **Home Assistant OS** (a Home Assistant Green/Yellow, a Raspberry Pi or a VM with the OS image) | as an add-on – 2a below |
| Home Assistant Supervised | as an add-on – 2a below |
| **Home Assistant Container** (Docker) or Core (Python) | **no add-ons** – run it as a container of its own, 2b below |

Either way it does the same; only where the options are written differs.

What it means for the home:

- **The Home Assistant token stays in that home.** The server can only ask for states and service
  calls, and only for the domains allowed in the options. Locks and alarms are not allowed unless
  you add `lock` or `alarm_control_panel` yourself.
- **Nothing is queued.** If the line is down, a command fails at once instead of running late.
- **Pairing is one-time.** A code from Smooth Family is traded for the gateway's own key. Only a hash
  of that key is kept on the server, and making a new code locks the old key out.

## 1. Make a pairing code

In Smooth Family: **Family settings → Sharing → Smart home → Add a home through the add-on**. Give it
a name, choose the home, and copy the eight-character code. The code is valid for 24 hours.

## 2a. As an add-on (Home Assistant OS)

Add-ons (called Apps in newer versions) only exist in Home Assistant OS and Supervised. With
Home Assistant Container or Core the menu isn't there – use 2b.

1. In Home Assistant: **Settings → Add-ons → Add-on store → ⋮ → Repositories**, then add
   `https://github.com/burnwalled/smoothfamily`.
2. Install **Smooth Family** and fill in the options:
   - `server`: `https://family.example.com`
   - `pairing_code`: the code from step 1
   - `read_domains` / `control_domains`: leave empty for the defaults
   - `auto_update`: on – see Updates below
3. Start it. The log says `Paired as …` and then `Connected to …`.

The add-on uses Home Assistant's own Supervisor token, so no long-lived token is needed.

## 2b. On its own (Home Assistant Container or Core)

Next to Home Assistant on the same machine, or on any computer in that home – a Raspberry Pi will do.
It needs a long-lived token: in Home Assistant, your profile → **Security → Long-lived access
tokens**. The token stays on this machine.

```sh
docker build -t smooth-family-gateway gateway/
docker run -d --name smooth-family-gateway --restart unless-stopped \
  -v smooth-family-gateway:/data \
  -e SF_SERVER=https://family.example.com \
  -e SF_PAIRING_CODE=ABCD2345 \
  -e HA_URL=http://homeassistant.local:8123 \
  -e HA_TOKEN=<a long-lived token from your Home Assistant profile> \
  smooth-family-gateway
```

## Updates

The gateway updates itself from your Smooth Family server – on by default (`auto_update`, or
`SF_AUTO_UPDATE=false` on its own to turn it off). It looks when it connects and every six hours.

- **Only signed code runs.** Each release is signed on the computer the releases are built on, with
  a key that never leaves it (`scripts/sign-gateway.py`). The gateway checks the signature against
  the public key built into it before it runs anything – the server only passes the file on, so even
  someone who took over the server couldn't run code in this home.
- **It falls back by itself.** The new version is kept in the data folder. If it doesn't connect
  within ten minutes, or crashes three times, the version that came with the add-on or the image
  runs again, and that version isn't fetched again.
- **With it off**, Smooth Family shows "Update available" on the home and tells the family's admins
  once per version; update the add-on or rebuild the image as in 2a/2b.

Releasing a new gateway: change `gateway/gateway.py` (and `version` in `config.yaml`), run
`backend/.venv/Scripts/python scripts/sign-gateway.py` and ship the server – a test fails if the
signed copy is older than the gateway.

## Defaults

| | Domains |
|---|---|
| Read | light, switch, fan, cover, climate, vacuum, scene, script, media_player, sensor, binary_sensor, weather, person, input_boolean, todo |
| Control | light, switch, fan, cover, climate, vacuum, scene, script, media_player, input_boolean, todo |

`todo` lets Smooth Family add a shopping list to one of Home Assistant's to-do lists, for example the
one an ICA or Coop integration syncs with the store's app.

Anything that can be controlled can also be read.
