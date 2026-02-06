# CNaught Carbon Tracker Plugin - Architecture

A Claude Code plugin that tracks and reports the carbon emissions of AI coding sessions.

## Overview

The carbon tracker plugin integrates with Claude Code's lifecycle hooks to:

1. Track token usage across all Claude responses
2. Calculate energy consumption and CO2 emissions
3. Store data locally in SQLite
4. Optionally sync to CNaught's backend for automated carbon offsetting
5. Display real-time emissions in Claude Code's statusline

## File Structure

```
plugins/carbon-tracker/
├── src/
│   ├── carbon-calculator.ts      # CO2 calculation engine
│   ├── data-store.ts             # SQLite database abstraction
│   ├── session-parser.ts         # Transcript JSONL parsing
│   ├── sync-service.ts           # Backend sync logic
│   ├── config.ts                 # Auth0 and API configuration
│   ├── oauth-flow.ts             # Browser-based OAuth PKCE flow
│   ├── index.ts                  # Main exports
│   ├── hooks/
│   │   ├── session-start.ts      # Initialize database
│   │   ├── stop.ts               # Save data after each response
│   │   └── session-end.ts        # Recover orphans, sync to backend
│   ├── scripts/
│   │   ├── carbon-setup.ts       # Initial setup & statusline install
│   │   ├── carbon-status.ts      # Show tracking stats
│   │   ├── carbon-report.ts      # 7-day emissions report
│   │   ├── carbon-sync.ts        # Manual sync utility
│   │   └── browser-oauth.ts      # Auth0 authentication
│   ├── statusline/
│   │   └── carbon-statusline.ts  # Real-time CO2 status bar display
│   └── utils/
│       └── stdin.ts              # Zod schemas for hook I/O
├── commands/                     # Command documentation (.md)
├── hooks/                        # Hook configuration
├── dist/                         # Compiled JavaScript
├── .claude-plugin/plugin.json    # Plugin metadata
└── build.mjs                     # esbuild configuration
```

## Lifecycle Hooks

The plugin uses three Claude Code lifecycle hooks:

### session-start

Called when a Claude Code session begins.

- Opens/creates SQLite database at `~/.claude/carbon-tracker.db`
- Creates `sessions` and `auth_config` tables if missing
- Non-blocking: errors are logged but don't fail the hook

### stop

Called after each Claude response.

1. Receives session metadata via stdin (session_id, project_path, transcript_path)
2. Finds the transcript file (`~/.claude/projects/<project>/<session-id>.jsonl`)
3. Parses JSONL to extract token usage (input, output, cache tokens)
4. Calculates CO2 emissions
5. Upserts session record in database

This provides crash recovery - if a session dies unexpectedly, data up to the last response is preserved.

### session-end

Called when a Claude Code session terminates.

1. **Orphan Recovery**: Scans `~/.claude/projects/` for JSONL files without database records and imports them
2. **Backend Sync**: If authenticated with CNaught:
   - Refreshes access token if expired
   - Resolves organization ID from GraphQL
   - Syncs all unsynced sessions
3. **Summary**: Displays session emissions and all-time statistics

## Carbon Calculation Methodology

Based on [ecologits.ai methodology](https://ecologits.ai/latest/methodology/llm_inference).

### Energy Calculation

```
Energy (Wh) = (Tokens / 1000) × WhPer1000Tokens × PUE
```

- **Tokens Counted**: Input + Output + Cache Creation + Cache Read
- **PUE (Power Usage Effectiveness)**: 1.2 (accounts for cooling, data center overhead)

### Model-Specific Energy Factors

| Model | Wh per 1K tokens |
|-------|------------------|
| Opus 4.5 | 0.030 |
| Opus 4 | 0.028 |
| Opus 3 | 0.025 |
| Sonnet 4 | 0.015 |
| Sonnet 3.5 | 0.014 |
| Sonnet 3 | 0.012 |
| Haiku 3.5 | 0.006 |
| Haiku 3 | 0.005 |
| Unknown | 0.015 (Sonnet default) |

### CO2 Calculation

```
CO2 (g) = (Energy Wh / 1000) × CarbonIntensity
```

- **Carbon Intensity**: 300 gCO2/kWh (conservative estimate for cloud data centers with renewable energy mix)
- Global average is 475 gCO2/kWh, US average is 380 gCO2/kWh

## Data Storage

### Local Database

**Location**: `~/.claude/carbon-tracker.db` (SQLite)

**Sessions Table**:
```sql
sessions (
  session_id TEXT PRIMARY KEY,
  project_path TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_creation_tokens INTEGER,
  cache_read_tokens INTEGER,
  total_tokens INTEGER,
  energy_wh REAL,
  co2_grams REAL,
  primary_model TEXT,
  created_at TEXT,
  updated_at TEXT,
  synced_at TEXT
)
```

**Auth Config Table** (singleton):
```sql
auth_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at TEXT,
  refresh_token_expires_at TEXT,
  organization_id TEXT,
  updated_at TEXT
)
```

### Transcript Parsing

Claude Code stores session transcripts as JSONL files at:
```
~/.claude/projects/<project-path>/<session-id>.jsonl
```

The parser:
- Filters for `type: "assistant"` entries
- Extracts model name from `message.model`
- Sums token counts from `message.usage`
- Deduplicates by request UUID (handles streaming)
- Includes subagent transcripts from `<session-id>/subagents/agent-*.jsonl`

## User Commands

| Command | Description |
|---------|-------------|
| `/carbon:setup` | Initialize plugin, install statusline, configure settings |
| `/carbon:status` | Show current tracking stats and sync status |
| `/carbon:report` | Generate 7-day emissions report with charts |
| `/carbon:sync` | Manually sync sessions or export as JSON |

### /carbon:setup

1. Initializes SQLite database schema
2. Writes standalone statusline script to `~/.claude/statusline-carbon.mjs`
3. Updates `~/.claude/settings.json` to enable statusline
4. Reports backend integration status

### /carbon:report

Generates a comprehensive report including:
- 7-day summary (sessions, tokens, energy, CO2)
- Relatable equivalents (km driven, phone charges, coffee cups)
- Daily breakdown with ASCII bar chart
- Project breakdown with top 5 emitters

## Statusline

Real-time CO2 display in Claude Code's status bar.

**Display Format**: `🌱 2.45g CO₂`

The statusline is a standalone ES module at `~/.claude/statusline-carbon.mjs` that:
1. Receives token counts via stdin
2. Calculates CO2 using embedded energy factors
3. Outputs formatted string to stdout

## Backend Sync

### Authentication

- OAuth 2.0 Authorization Code Grant with PKCE
- Browser-based login flow on port 19876
- Tokens stored in local SQLite

### Sync Process

1. Refresh access token if expired (60s before expiry)
2. Query GraphQL to resolve organization ID
3. Call `UpsertMyClaudeCodeSession` mutation for each unsynced session
4. Mark sessions as synced on success

### Configuration

Environment variables (with defaults):
- `CNAUGHT_AUTH0_DOMAIN`: cnaught.us.auth0.com
- `CNAUGHT_AUTH0_CLIENT_ID`
- `CNAUGHT_AUTH0_AUDIENCE`
- `CNAUGHT_API_URL`: https://api.cnaught.com
- `CNAUGHT_SKIP_TLS_VERIFY`: false

## Data Flow

```
Session Start
     │
     ▼
[session-start hook] ──► Initialize DB
     │
     ▼
User interacts with Claude
     │
     ▼
Claude responds (repeats)
     │
     ▼
[stop hook] ──► Parse transcript ──► Calculate CO2 ──► Save to DB
     │
     ├──► [Statusline] ──► Display "🌱 X.XXg CO₂"
     │
     ▼
Session ends
     │
     ▼
[session-end hook]
     ├──► Recover orphaned sessions
     ├──► Sync to backend (if authenticated)
     └──► Display summary
```

## Key Design Decisions

1. **Local-First**: All data stored locally; backend sync is optional
2. **Crash Recovery**: Stop hook saves after each response; session-end recovers orphans
3. **Non-Blocking**: Errors are logged but never fail Claude Code
4. **Standalone Statusline**: Separate script avoids dependency loading for performance
5. **Model Family Fallback**: Unknown models matched by family name pattern
6. **PKCE Authentication**: No client secret exposure in browser flow

## Building

```bash
bun run build      # Compile TypeScript with esbuild
bun run typecheck  # Type check without emit
bun run clean      # Remove dist/
```
