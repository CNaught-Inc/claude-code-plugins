# /carbon:setup

Set up the CNaught carbon tracking plugin.

## Instructions

Follow these steps in order:

### Step 0: Check for existing setup

Run the setup check script to see if the plugin has already been set up:

```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-setup-check.ts
```

This outputs JSON. If `isSetup` is `true`, the plugin has already been configured. Show the user their current configuration:
- When they first set up (installedAt)
- Whether sync is enabled and their team name
- Their project ID
- Whether the statusline is active

Then ask the user what they'd like to do:
- **Reconfigure** — walk through the full setup again (continue to Step 1)
- **Nothing** — everything is already set up, exit

If `isSetup` is `false`, this is a first-time setup — proceed to Step 1.

### Step 1: Ask about historical sessions

Ask the user whether they want to:
- **Start fresh** — only track new sessions going forward
- **Backfill** — process all previous Claude Code sessions from transcript files on disk

### Step 2: Ask for team name

Ask the user for their team name (free text, **required**). Tell them that this should usually be something like their company or organization name. This is used to group users into teams and identify their sessions. They cannot skip this. DO NOT use the AskUserQuestion tool here since they have to provide an input.

### Step 3: Ask about anonymous tracking

Ask the user whether they want to enable anonymous carbon tracking with CNaught:
- **Enable** — session metrics (token counts, CO₂, energy, project ID) will be synced to CNaught's API. No code, conversations, or personal information is shared. (default)
- **Disable** — all data stays local only

### Step 4: Run the setup script

Build the command with the appropriate flags based on the user's choices:
- Always include `--team "Their Team"`
- Add `--backfill` if the user chose to backfill historical sessions
- Add `--disable-sync` if the user chose to disable anonymous tracking

```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-setup.ts --team "Team Name" [--backfill] [--disable-sync]
```

This will:
- Initialize the local SQLite database and store the team name
- Convert any project/local scope installation to user (global) scope
- Configure `~/.claude/settings.json` to enable the CO₂ statusline (active across all projects)
- (If `--backfill`) Process historical transcript files into the database
- (Unless `--disable-sync`) Generate a random identity and enable background sync to CNaught API

### Step 5: Check for local statusline overrides

After the setup script runs, check if the current project has a `.claude/settings.local.json` or `.claude/settings.json` file that contains its own `statusLine` entry. If it does, warn the user that this local statusline will override the global carbon statusline, and the CO₂ indicator won't appear in this project. Offer to remove the `statusLine` key from the local file to fix it.

### Step 6: Verify setup

```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-report.ts
```

Show the output to the user and confirm that the database is initialized, the statusline is installed, and CO₂ tracking is active.

## Notes

- You can run setup again at any time to reconfigure
- The statusline shows real-time CO₂ estimates in the Claude Code status bar across all projects
- Sessions are tracked automatically via hooks — no manual action needed
- If sync is enabled, data syncs in the background after each response (non-blocking)
- Always use the `AskUserQuestion` tool when asking the user a question that has multiple choices.
