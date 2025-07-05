# Bambu CLI

A simple command-line tool to control Bambu Lab 3D printers over LAN mode.
The main feature is skipping objects: just execute 'get-objects', chose which object were failed and put their IDs into the 'skip' subcommand.

Huge shoutout to https://github.com/Doridian/OpenBambuAPI.

## Quick Start

### Install
```bash
npm install -g .
```

### Add your printer
```bash
bambu-cli config add my-printer 192.168.1.100 01S00A1234567890 your-access-code
```

### Basic commands
```bash
# Check printer status
bambu-cli status my-printer

# Get current print objects
bambu-cli get-objects my-printer --colored

# Skip failed objects
bambu-cli skip my-printer 1993 1994
```

### Custom Commands
For not implemented functionality and testing. Put json in it as shown.
```bash
# Enable work light
bambu-cli command my-printer '{"system":{"sequence_id":"0","command":"ledctrl","led_node":"work_light","led_mode":"on"}}'

# Pause print
bambu-cli command my-printer '{"print": {"sequence_id": "0", "command": "pause"}}'
```

## Setup

1. **Enable LAN mode** on your Bambu printer
2. **Get your access code** from the printer's network settings
3. **Find your printer's IP** address on your network
4. **Add printer to config**:
   ```bash
   bambu-cli config add <name> <ip> <device-id> <access-code>
   ```
Config file is located under `~/.bambu-cli/config.yml`

## Notes

- Works with Bambu Lab printers in LAN mode. Tested with A1 and A1 mini.
- Requires network access to the printer
- Some commands only work when actively printing
- Mostly vibe-coded, so some(or most) decisions are highly questionable, but it gets the job done, and doing it manually would take eternity.

## Help

```bash
# General help
bambu-cli --help

# Command-specific help
bambu-cli status --help
bambu-cli skip --help
``` 