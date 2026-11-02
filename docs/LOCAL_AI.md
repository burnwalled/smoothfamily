# Local AI

Smooth Family can let a computer at home do a few AI jobs: read a receipt into the pantry, turn a
pasted text or a photo into a recipe, split "milk, 2 packs of butter and bread" into list items, and
suggest dinners from what is about to run out. It is optional – every one of these can be done by
hand, and a member can always choose to.

- **Nothing leaves the house.** The AI is [Ollama](https://ollama.com) on your own computer. The
  server only accepts an address on the home network.
- **Jobs wait.** The computer doesn't have to be on: jobs queue up and run when it answers, and the
  member gets a notification when theirs is done.
- **Nothing is saved by the AI.** Its answer is a suggestion; the member looks at it, changes what
  is wrong and only then puts it in the pantry, the recipes or the list.
- **Hosted families** can use it only if the server admin allows it and their own admin turns it on
  (Family admin → Integrations). They are told that the AI runs on the server owner's computer.

The NAS itself is far too small to run a language model – it only keeps the queue.

## 1. Install Ollama and the models

Install Ollama from <https://ollama.com> and fetch a model for text and one for pictures. On a
computer with a 24 GB graphics card these work well (tested with Swedish receipts and recipes):

```powershell
ollama pull qwen3:30b-a3b   # text: recipes, lists, sorting a receipt, dinner ideas
ollama pull qwen3-vl:8b     # pictures: reading the lines of a receipt or a cookbook page
```

A receipt is read in two steps: the picture model copies the lines, the text model cleans up the
names and decides where things are kept and how long they keep.

`gpt-oss:20b` gave empty answers with structured output in Ollama 0.30 – prefer the Qwen models.

## 2. Let Ollama answer on the home network

By default Ollama only listens on the computer itself. Let it listen on the network, then quit and
start Ollama again:

```powershell
setx OLLAMA_HOST 0.0.0.0:11434
```

Then allow only the server in through Windows' firewall (PowerShell as administrator, with your
NAS's address):

```powershell
New-NetFirewallRule -DisplayName "Ollama (Smooth Family)" -Direction Inbound -Protocol TCP `
  -LocalPort 11434 -RemoteAddress 192.168.1.10 -Action Allow
```

## 3. Tell the server where it is

Server → Local AI: write the computer's address (e.g. `http://192.168.1.20:11434`), press **Test**,
choose the models and **Save**. Choose how often the server looks for the computer (e.g. every 5
minutes) and how long waiting jobs are kept.

## 4. Optional: wake the computer and let it sleep again

**Waking (Wake-on-LAN):** turn it on in the computer's BIOS/UEFI and in Windows (Device Manager →
the network card → Properties → Power Management: *Allow this device to wake the computer*, and
Advanced: *Wake on Magic Packet*). Write the computer's MAC address (`ipconfig /all` → Physical
Address) under Server → Local AI and turn on waking. When a job waits and the computer doesn't
answer, the server sends a wake-up (at most every 10 minutes).

**Sleeping again:** copy the *address for the sleep helper* from Server → Local AI and run
`scripts/ai-sleep-helper.ps1` every 5 minutes as a scheduled task:

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument `
  '-ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\SmoothFamily\ai-sleep-helper.ps1" -HelperUrl "https://<server>/api/ai/helper?key=<key>"'
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "Smooth Family AI sleep" -Action $action -Trigger $trigger
```

It only puts the computer to sleep when Smooth Family woke it, the queue has been empty for 10
minutes and nobody has used the keyboard or mouse for 15 minutes. If you are at the computer,
nothing happens.

## Development

In dev (Docker Desktop on the same computer) use `http://host.docker.internal:11434` – Docker
forwards it to Ollama on the computer, so step 2 isn't needed.
