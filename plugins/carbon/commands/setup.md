# /carbon:setup

Set up the CNaught carbon tracking plugin.

## Instructions

Follow these steps in order:

### Step 1: Ask about historical sessions

Ask the user whether they want to:
- **Start fresh** — only track new sessions going forward
- **Backfill** — process all previous Claude Code sessions from transcript files on disk

### Step 2: Ask about anonymous tracking

Ask the user whether they want to enable anonymous carbon tracking with CNaught:
- **Enable** — session metrics (token counts, CO2, energy, project path) will be synced to CNaught's API. No code, conversations, or personal information is shared.
- **Disable** — all data stays local only (default)

If the user chose to enable, ask them for an optional display name. Let them know that if they skip this, a fun random name will be generated for them (e.g., "Curious Penguin", "Swift Falcon").

### Step 3: Run the setup script

Build the command with the appropriate flags based on the user's choices:
- Add `--backfill` if the user chose to backfill historical sessions
- Add `--enable-sync` if the user chose to enable anonymous tracking
- Add `--user-name "Their Name"` if the user provided a custom display name

```bash
bun --env-file=${CLAUDE_PLUGIN_ROOT}/.env.local ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-setup.ts [--backfill] [--enable-sync]
```

This will:
- Initialize the local SQLite database
- Configure `.claude/settings.local.json` (project-level) to enable the CO2 statusline
- Migrate any old global statusline config from `~/.claude/settings.json`
- (If `--backfill`) Process historical transcript files into the database
- (If `--enable-sync`) Generate a random identity and enable background sync to CNaught API

### Step 4: Verify setup

```bash
bun --env-file=${CLAUDE_PLUGIN_ROOT}/.env.local ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-report.ts
```

Show the output to the user and confirm that the database is initialized, the statusline is installed, and CO2 tracking is active.

## Notes

- You can run setup again at any time to reconfigure
- The statusline shows real-time CO2 estimates in the Claude Code status bar
- Sessions are tracked automatically via hooks — no manual action needed
- If sync is enabled, data syncs in the background after each response (non-blocking)
