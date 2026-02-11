# CNaught Claude Code Plugins

A monorepo of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugins by [CNaught](https://www.cnaught.com).

## Plugins

### Carbon Tracker (`plugins/carbon`)

Track and offset carbon emissions from your Claude Code usage

**Features:**

- Estimates carbon emissions per Claude Code session based on token usage
- Stores session data locally via SQLite
- Provides status line integration showing session carbon impact
- Includes scripts for setup, reporting, and syncing

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

On push to `main` and on pull requests, GitHub Actions will typecheck, test, and build to validate changes.

### Releasing

Releases are triggered manually via workflow dispatch via github UI or CLI.

The release workflow will:

1. Typecheck, test, and build on `main`
2. Bump plugin versions in `marketplace.json` and each plugin's `plugin.json`
3. Commit the built `dist/` and version bumps to `main`
4. Tag the release commit (e.g., `v1.0.0`)
5. Create a GitHub Release with auto-generated notes
