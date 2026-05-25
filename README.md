# Bambu CLI

A simple command-line tool to control Bambu Lab 3D printers over LAN mode (LAN and LAN+dev).
The headline feature is skipping failed objects: run `get-objects`, pick the IDs that failed,
and pass them to `skip`.

Huge shoutout to https://github.com/Doridian/OpenBambuAPI.

## Install

**One-liner (macOS / Linux)** — downloads the latest release binary into `~/.local/bin`:

```bash
curl -fsSL https://raw.githubusercontent.com/latsss/bambu-cli/main/install.sh | sh
```

For a different destination:

```bash
curl -fsSL https://raw.githubusercontent.com/latsss/bambu-cli/main/install.sh | BINDIR=/usr/local/bin sudo sh
```

**Windows** — grab `bambu-cli-windows-x64.exe` from the
[latest release](https://github.com/latsss/bambu-cli/releases/latest), rename to
`bambu-cli.exe`, and put it somewhere on your `PATH`.

**From source** (requires Node 20+):

```bash
git clone https://github.com/latsss/bambu-cli && cd bambu-cli
npm install
npm install -g .
# or build a standalone binary for your OS:
npm run build:sea   # output at dist/bambu-cli
```

## Add your printer

```bash
bambu-cli config add my-printer 192.168.1.100 01S00A1234567890 your-access-code
```

Config is stored at `~/.bambu-cli/config.yml` with mode `0600` (access codes live in it,
so the file is only readable by you).

## Commands

```bash
# Info
bambu-cli status my-printer
bambu-cli status --all              # query every configured printer
bambu-cli version my-printer
bambu-cli monitor my-printer        # stream live updates until Ctrl+C

# Print control
bambu-cli pause my-printer
bambu-cli resume my-printer
bambu-cli stop my-printer
bambu-cli start my-printer /file.3mf
bambu-cli skip my-printer 1993 1994

# Objects
bambu-cli get-objects my-printer --colored
bambu-cli get-objects my-printer --shape    # silhouettes from the 3MF's top-down PNG

# LED
bambu-cli light my-printer on
bambu-cli light my-printer off --node chamber_light

# Filament
bambu-cli filament unload my-printer

# Files (FTP)
bambu-cli fs ls my-printer /
bambu-cli fs pull my-printer /Metadata/plate_1.png
bambu-cli fs push my-printer ./model.3mf /model.3mf

# Custom MQTT (for experimentation)
bambu-cli command my-printer '{"system":{"sequence_id":"0","command":"ledctrl","led_node":"work_light","led_mode":"on"}}'
```

## Global flags

```
-v, --verbose      verbose logging (debug level, written to stderr)
-q, --quiet        only log errors
    --json         machine-readable JSON output to stdout
    --no-color     disable colored output (also honors NO_COLOR env)
```

Logs always go to stderr; `--json` keeps stdout clean for piping into `jq`/scripts.

## Setup

1. Enable **LAN mode** (and optionally **LAN+dev** for richer telemetry) on your printer.
2. Get the **access code** from the printer's network settings.
3. Find the printer's **IP address** on your network.
4. Add the printer via `bambu-cli config add`.

## Notes

- Tested with A1 and A1 mini.
- `fs pull` refuses to write outside the current working directory unless you pass an
  absolute local path or `--allow-outside`. Belt-and-suspenders against typos.
- **Storage**: the printer's FTPS server only exposes the **USB/SD slot**. On models with
  on-board internal storage (e.g. P2S), the internal store is not reachable through this
  CLI — Bambu Studio uses a separate, undocumented mechanism for it.
- TLS verification on MQTT is disabled by default because Bambu uses self-signed device
  certs that vary across firmware. Auth is anchored in the access code. Set
  `BAMBU_STRICT_TLS=1` to re-enable strict CA pinning (only works with older P1/A1 firmware).
- For LAN+dev specifically, the same commands work — you just get more fields in `status` /
  `monitor` output.
- Mostly vibe-coded, then mostly de-vibed.

## Help

```bash
bambu-cli --help
bambu-cli status --help
bambu-cli skip --help
```
