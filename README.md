# CNaught Claude Code Plugins

A monorepo of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugins by [CNaught](https://www.cnaught.com).

## Plugins

### Carbon Tracker (`plugins/carbon`)

Track and offset carbon emissions from your Claude Code usage. This plugin estimates the carbon footprint of your AI sessions and enables automatic carbon offset purchasing through CNaught.

**Features:**

- Estimates carbon emissions per Claude Code session based on token usage
- Stores session data locally via SQLite
- Syncs emission data to CNaught for offset purchasing (via OAuth)
- Provides status line integration showing session carbon impact
- Includes CLI scripts for setup, reporting, and syncing

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
bun run build       # Build all plugins
bun run test        # Run tests
bun run typecheck   # Type-check all plugins
bun run lint        # Lint all plugins
bun run clean       # Clean build artifacts
```

### Project Structure

```
.claude-plugin/     # Plugin marketplace metadata
plugins/
  carbon/           # Carbon tracker plugin
    src/            # Source code
    dist/           # Built output (committed via CI)
```

### CI

On push to `main`, GitHub Actions will build, test, and auto-commit the `dist/` directories so plugins can be installed directly from the repo without a build step.
