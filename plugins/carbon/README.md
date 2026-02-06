# CNaught Carbon Tracker for Claude Code

A Claude Code plugin that tracks carbon emissions from your AI usage and enables automatic carbon offset purchasing through CNaught.

## Features

- **Real-time tracking**: See your CO2 emissions in the status bar as you code
- **Local storage**: All session data stored locally in SQLite
- **Backend sync**: Optional integration with CNaught for automatic carbon offsetting
- **Crash recovery**: Orphaned sessions are automatically recovered
- **Detailed reports**: View your emissions by day, project, and model

## Installation

1. Clone or download this plugin to your Claude Code plugins directory
2. Build the plugin: `bun run build`
3. Run the setup command: `/carbon:setup`

## Commands

| Command | Description |
|---------|-------------|
| `/carbon:setup` | Configure the plugin and install statusline |
| `/carbon:status` | View current tracking statistics |
| `/carbon:report` | Generate a 7-day emissions report |

## How It Works

### Carbon Calculation

The plugin uses the [ecologits.ai methodology](https://ecologits.ai/latest/methodology/llm_inference) to estimate carbon emissions:

1. **Token counting**: Tracks input, output, and cache tokens from Claude Code transcripts
2. **Energy calculation**: Converts tokens to Watt-hours using model-specific factors
3. **CO2 estimation**: Applies carbon intensity (gCO2/kWh) and PUE factors

Model energy factors (Wh per 1000 tokens):
- Opus: 0.028-0.030 Wh
- Sonnet: 0.012-0.015 Wh
- Haiku: 0.005-0.006 Wh

### Data Storage

Session data is stored in SQLite at `~/.claude/carbon-tracker.db`:
- Session ID and project path
- Token counts (input, output, cache)
- Energy consumption (Wh)
- CO2 emissions (grams)
- Sync status with backend

### Hooks

The plugin uses three hooks:

1. **session-start**: Initializes the database
2. **stop**: Saves session data after each Claude response
3. **session-end**: Recovers orphaned sessions and syncs to backend

## Backend Integration

To enable automatic carbon offsetting:

1. Get your API key from https://app.cnaught.com/settings/api
2. Set the `CNAUGHT_API_KEY` environment variable
3. Sessions will automatically sync to CNaught
4. Configure auto-offset threshold in your CNaught dashboard

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CNAUGHT_API_KEY` | Your CNaught API key for backend sync | Optional |
| `CNAUGHT_API_ENDPOINT` | Custom API endpoint | Optional |

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Watch mode
bun run watch

# Type check
bun run typecheck
```

## License

MIT
