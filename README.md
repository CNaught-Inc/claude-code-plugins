# CNaught Claude Code Plugins

A monorepo of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugins by [CNaught](https://www.cnaught.com).

## Plugins

### [Carbon Tracker](plugins/carbon/)

Track carbon emissions from your Claude Code usage. See real-time CO2 estimates in your status bar, generate reports with relatable equivalents, and optionally sync anonymized metrics to CNaught.

See the [Carbon Tracker README](plugins/carbon/README.md) for installation, setup, commands, statusline, and more.

### [Parsimony](plugins/parsimony/)

Token efficiency skill that reduces controllable token usage by ~30% and speeds up responses by ~48% — without sacrificing output quality. Uses input reduction, concise output, and smart model selection.

See the [Parsimony README](plugins/parsimony/README.md) for installation, modes, benchmarks, and more.

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
  parsimony/        # Token efficiency plugin
    skills/         # Skill definitions
    commands/       # Slash commands (/token-mode, /token-report)
```

### Releasing

Trigger the "Release" workflow manually with a version number (e.g., `1.6.0`). This will update `plugin.json`, commit, tag, and create a GitHub release.

### Versioning

Plugin version lives in `plugins/<plugin>/.claude-plugin/plugin.json`.
