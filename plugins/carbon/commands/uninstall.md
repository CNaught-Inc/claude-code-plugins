# /carbon:uninstall

Uninstall the CNaught carbon tracking plugin and delete all local data.

## Instructions

### Step 1: Confirm with the user

Ask the user to confirm: "This will permanently delete your carbon tracking database and all local tracking data. Are you sure?"

- If **no**: Stop here.
- If **yes**: Continue.

### Step 2: Run the uninstall script

```bash
node scripts/bun-runner.js dist/scripts/carbon-uninstall.js
```

This will:
- Delete the SQLite database (`~/.claude/carbon-tracker.db`)
- Remove the statusline script (`~/.claude/statusline-carbon.mjs`)
- Remove the statusLine configuration from `~/.claude/settings.json`
- Remove the plugin from `~/.claude/plugins/installed_plugins.json`

### Step 3: Confirm completion

Let the user know the uninstall is complete and that they can re-install at any time with `/carbon:setup`.
