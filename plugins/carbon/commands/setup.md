# /carbon:setup

Set up the CNaught carbon tracking plugin.

## Instructions

Follow these steps in order:

### Step 1: Ask about historical sessions

Ask the user whether they want to:
- **Start fresh** — only track new sessions going forward
- **Backfill** — process all previous Claude Code sessions from transcript files on disk

### Step 2: Run the setup script

If the user chose to backfill:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/bun-runner.js ${CLAUDE_PLUGIN_ROOT}/dist/scripts/carbon-setup.js --backfill
```

Otherwise:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/bun-runner.js ${CLAUDE_PLUGIN_ROOT}/dist/scripts/carbon-setup.js
```

This will:
- Initialize the local SQLite database
- Install the statusline script to `~/.claude/statusline-carbon.mjs`
- Configure `~/.claude/settings.json` to enable the CO2 statusline
- (If `--backfill`) Process historical transcript files into the database

### Step 3: Verify setup

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/bun-runner.js ${CLAUDE_PLUGIN_ROOT}/dist/scripts/carbon-status.js
```

Show the output to the user and confirm that the database is initialized, the statusline is installed, and CO2 tracking is active.

## Notes

- You can run setup again at any time to reconfigure
- The statusline shows real-time CO2 estimates in the Claude Code status bar
- Sessions are tracked automatically via hooks — no manual action needed
