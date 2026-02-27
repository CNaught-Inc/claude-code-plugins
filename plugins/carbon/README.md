# Carbon Tracker Plugin

Track carbon emissions from your Claude Code usage. See real-time CO₂ estimates in your status bar, generate reports with relatable equivalents, and optionally sync anonymized metrics to CNaught.

**Features:**

- Estimates carbon emissions per session using the [Jegham et al.](https://arxiv.org/abs/2505.09598) methodology
- Stores session data locally via SQLite (`~/.claude/carbon-tracker.db`)
- Real-time status line showing session and all-time CO₂ emissions
- Slash commands for setup, reporting, project renaming, and uninstalling
- Optionally sync anonymous metrics to CNaught (no code or conversations shared)

## Prerequisites

This plugin requires **Node.js (v18+)** with `npx` available on your `PATH`. `npx` is used to run the plugin's hooks and scripts. All other dependencies are installed automatically.

Verify with `node --version && npx --version`. If not installed, get Node.js from [nodejs.org](https://nodejs.org) or via your package manager (e.g., `brew install node`).

> **Note:** If you use a version manager like `nvm`, make sure Node.js is available in the system-wide PATH.

## Installation

Add the marketplace and install the carbon plugin in Claude Code:

```
/plugin marketplace add CNaught-Inc/claude-code-plugins
/plugin install carbon@cnaught-plugins
```

Restart Claude Code and then run `/carbon:setup` to initialize the tracker.

### Local (development)

To install from a local clone of this repo:

```bash
bun install
```

Then in Claude Code:

```
/plugin marketplace add /path/to/claude-code-plugins
/plugin install carbon@cnaught-plugins
```

Restart Claude Code and then run `/carbon:setup` to initialize the tracker.

### Staging API (installed plugins)

By default, the plugin points at the production API.

If you've installed a local copy of the plugin, to point at the stage API, copy `.env.local.sample` to `.env.local` before running.

If you have the plugin installed from GitHub and want to point at the staging API, add this to `~/.claude/settings.json`:

```json
{
  "carbonTracker": {
    "apiUrl": "https://api-stage.cnaught.com"
  }
}
```

Data is automatically stored in a separate database per API endpoint, so staging and production data never mix.

### Updating

Update the marketplace to fetch the latest available versions, then update the plugin:

```
/plugin marketplace update cnaught-plugins
/plugin update carbon@cnaught-plugins
```

You can also manage all of this interactively via Claude Code's built-in `/plugin` command. We recommend enabling auto-update for the marketplace so you always have access to the latest versions — go to `/plugin` > **Marketplaces** > select the marketplace > **Enable auto-update**.

## Setup

After installing, run `/carbon:setup` in any project. It walks you through:

1. **Project name** — defaults to your GitHub repo (e.g., `org/repo`), or set a custom name
2. **Historical sessions** — start fresh or backfill from existing transcript files on disk
3. **Anonymous tracking** — optionally sync metrics to CNaught's API
4. **Display name** — choose a name or get a random one (e.g., "Curious Penguin")

Setup initializes the SQLite database, configures the CO₂ statusline in `.claude/settings.local.json`, and optionally enables background sync. Dependencies are installed automatically on first session start.

## Commands

| Command | Description |
|---------|-------------|
| `/carbon:setup` | Initialize and configure the plugin |
| `/carbon:report` | Generate a carbon emissions report |
| `/carbon:rename-project` | Change the project name (or reset to auto-detect) |
| `/carbon:rename-user` | Change your display name for anonymous tracking |
| `/carbon:uninstall` | Remove carbon tracking for the current project |

### `/carbon:report`

Generates a report including:

- **All-time totals** — CO₂ (kg), energy (kWh), sessions, and tokens
- **Relatable equivalents** — car-years off road, days of home energy usage
- **Usage by model** — breakdown by Claude model with visual progress bars
- **Project breakdown** — top projects from the last 30 days (shown when multiple projects exist)
- **Anonymous sync info** — display name and pending sync count (when sync is enabled)

### `/carbon:uninstall`

Removes tracking data for the current project. If no other projects have tracked sessions, the database and statusline config are also cleaned up. You can reinstall at any time.

## Statusline

Once set up, the status bar shows real-time CO₂:

```
🌱 Session: 0.42g / 12.35g CO₂ · org_repo_a1b2c3d4 · Curious Penguin · ✓ synced
```

| Segment | Description |
|---------|-------------|
| `Session: 0.42g` | CO₂ for the current session |
| `/ 12.35g CO₂` | All-time total for this project |
| `org_repo_a1b2c3d4` | Project identifier (hidden for local-only projects) |
| `Curious Penguin` | Your display name (shown when sync is enabled) |
| `✓ synced` / `○ pending` | Sync status for the current session |

The session value starts as a live estimate from context window tokens, then switches to the authoritative database value after the stop hook runs.

## How It Works

The plugin uses Claude Code [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) to track usage automatically:

- **SessionStart** — installs dependencies if needed, initializes the database, and batch-syncs any pending sessions
- **Stop** — parses the session transcript, calculates energy and CO₂, and saves to the local SQLite database. An async background sync runs if enabled (15s timeout, non-blocking).

### Carbon Calculation

Calculations use the [Jegham et al.](https://arxiv.org/abs/2505.09598) methodology ("How Hungry is AI?"):

```
Energy (Wh)  = (TTFT + outputTokens / TPS) × (GPU_power × util + nonGPU_power × util) × PUE
CO₂ (g)      = Energy (Wh) × CIF
```

Per-model configs (Haiku, Sonnet, Opus) capture GPU power draw, utilization bounds, datacenter PUE, and carbon intensity factor. Each API request incurs its own TTFT cost for accurate per-request accounting.

### Project Identification

Projects are identified automatically with this priority:

1. **Custom name** (via `/carbon:setup` or `/carbon:rename-project`) — `<name>_<hash>`
2. **Git remote** — `<org>_<repo>_<hash>` (e.g., `cnaught_claude-code-plugins_a1b2c3d4`)
3. **Local fallback** — `local_<hash>`

The hash is the first 8 characters of SHA-256 of the project path, ensuring uniqueness across machines.

## Privacy

When anonymous sync is enabled, the following metrics are sent to CNaught's API:

- Token counts (input, output, cache creation, cache read)
- Energy consumption (Wh) and CO₂ emissions (g)
- Model used and session timestamps
- Project identifier and display name

**No code, conversation content, or personal information is ever shared.** Sync can be disabled at any time by re-running `/carbon:setup`.
