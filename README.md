# CNaught Claude Code Plugins

A monorepo of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugins by [CNaught](https://www.cnaught.com).

## Plugins

### Carbon Tracker (`plugins/carbon`)

Track and offset carbon emissions from your Claude Code usage

**Features:**

- Estimates carbon emissions per Claude Code session based on token usage
- Stores session data locally via SQLite
- Provides status line integration showing session carbon impact
- Includes commands for setup and reporting

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

To point at a staging API, create `plugins/carbon/.env.local`:

```
CNAUGHT_API_URL=https://your-staging-api-url.com
```

### Updating

To pull the latest plugin version:

```
/plugin marketplace update cnaught-plugins
```

## Development

### Prerequisites

- [Bun](https://bun.sh/) v1.3.6+
- Node.js 20+

### Setup

```bash
bun install
```

### Commands

```bash
bun run test        # Run tests
bun run typecheck   # Type-check all plugins
bun run lint        # Lint all plugins
```

### Project Structure

```
.claude-plugin/     # Plugin marketplace metadata
plugins/
  carbon/           # Carbon tracker plugin
    src/            # Source code (run directly by Bun)
```

### Releasing

Trigger the "Release" workflow manually with a version number (e.g., `1.6.0`). This will update `plugin.json`, commit, tag, and create a GitHub release.

### Versioning

Plugin version lives in `plugins/<plugin>/.claude-plugin/plugin.json`.
