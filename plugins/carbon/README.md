# Carbon Tracker Plugin

Track carbon emissions from your Claude Code usage. See real-time CO₂ estimates in your status bar, generate reports with relatable equivalents, and optionally sync anonymized metrics to CNaught.

**Features:**

- Estimates carbon emissions per session using the [Jegham et al.](https://arxiv.org/abs/2505.09598) methodology
- Stores session data locally via SQLite (`~/.claude/carbon-tracker.db`)
- Real-time status line showing CO₂ emissions and energy
- Slash commands for setup, reporting, project renaming, and uninstalling
- Optionally sync anonymous metadata to CNaught (no conversation content is shared)

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

## Updating

Update the marketplace to fetch the latest available versions, then update the plugin:

```
/plugin marketplace update cnaught-plugins
/plugin update carbon@cnaught-plugins
```

Then you can run the following or just restart Claude Code:
```
/reload-plugins
```

You can also manage all of this interactively via Claude Code's built-in `/plugin` command. We recommend enabling auto-update for the marketplace so you always have access to the latest versions — go to `/plugin` > **Marketplaces** > select the marketplace > **Enable auto-update**.

## Setup

After installing, run `/carbon:setup` in any project. It walks you through:

1. **Historical sessions** — start fresh or backfill from existing transcript files on disk
2. **Anonymous tracking** — optionally sync metrics to CNaught's API
3. **Team** — optionally provide your team name

Setup initializes the SQLite database, configures the CO₂ statusline, and optionally enables background sync. Dependencies are installed automatically on first session start.

## Commands

| Command | Description |
|---------|-------------|
| `/carbon:setup` | Initialize and configure the plugin |
| `/carbon:report` | Generate a carbon emissions report |
| `/carbon:rename-team` | Change your team name for anonymous tracking |
| `/carbon:uninstall` | Remove carbon tracking for the current project |
| `/carbon:cleanup-cache` | Remove old cached plugin versions to free disk space |

### `/carbon:report`

Generates a report including:

- **All-time totals** — CO₂ (kg), energy (kWh), sessions, and tokens
- **Relatable equivalents** — car-years off road, days of home energy usage
- **Usage by model** — breakdown by Claude model with visual progress bars
- **Project breakdown** — top projects from the last 30 days (shown when multiple projects exist)
- **Anonymous sync info** — team name and pending sync count (when sync is enabled)

### `/carbon:uninstall`

Removes tracking data for the current project. If no other projects have tracked sessions, the database and statusline config are also cleaned up. You can reinstall at any time.

### `/carbon:cleanup-cache`

Claude Code downloads each plugin version into a separate cache directory (`~/.claude/plugins/cache/`) but never removes old versions. Over time this accumulates stale copies that waste disk space. This command removes old cached versions, keeping the current version and the most recent prior version. This command will be deprecated once Claude Code implements auto-cleanup logic internally (https://github.com/anthropics/claude-code/issues/14980).

## Statusline

Once set up, the status bar shows real-time CO₂ emissions and energy

```
Climate Impact: CO₂ 2.73kg · Energy 9.10kWh ⇄
```

| Component | Description |
|---------|-------------|
| `CO₂ 2.73kg` | CO₂ emissions across all sessions and projects |
| `Energy 9.10kWh` | Energy consumption across all sessions and projects |
| `⇄` | Session sync status |

If you have an existing statusline command configured, the Carbon plugin will do its best to append this statusline to the end of the existing one, separated by a `|`.

## How It Works

The plugin uses Claude Code [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) to track usage automatically:

- **SessionStart** — installs dependencies if needed, initializes the database, auto-updates the statusline path if the plugin version changed, and batch-syncs any unsynced sessions
- **Stop** — parses the session transcript, calculates energy and CO₂, and saves to the local SQLite database. An async background sync runs if enabled (15s timeout, non-blocking).

### Carbon Calculation

Calculations use the [Jegham et al.](https://arxiv.org/abs/2505.09598) methodology ("How Hungry is AI?"):

```
Energy (Wh)  = (TTFT + outputTokens / TPS) × (GPU_power × util + nonGPU_power × util) × PUE
CO₂ (g)      = Energy (Wh) × CIF
```

Per-model configs (Haiku, Sonnet, Opus) capture GPU power draw, utilization bounds, datacenter PUE, and carbon intensity factor. Each API request incurs its own TTFT cost for accurate per-request accounting.

### Project Identification

Projects are identified by a hash of the project path — the first 8 characters of SHA-256. This ensures a stable, unique identifier across machines.

## Privacy

When session sync is enabled, the following metrics are sent to CNaught's API:

- Token counts (input, output, cache creation, cache read)
- Energy consumption (Wh) and CO₂ emissions (g)
- Models used
- Project identifier (hash of project path)

**No code, conversation content, or personal information is ever shared.** Sync can be disabled at any time by re-running `/carbon:setup`.

## Plugin Development

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

### Changing the API endpoint

By default, the plugin points at the production API. You can change the API endpoint by adding this to `~/.claude/settings.json`:

```json
{
  "carbonTracker": {
    "apiUrl": "https://api-stage.cnaught.com"
  }
}
```

Data is automatically stored in a separate database per API endpoint, so different environments' data never mix.