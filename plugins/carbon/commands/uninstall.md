# /carbon:uninstall

Uninstall the CNaught carbon tracking plugin and delete all local data.

## Instructions

### Step 1: Confirm with the user

Ask the user to confirm: "This will permanently delete your carbon tracking database and all local tracking data. Are you sure?"

- If **no**: Stop here.
- If **yes**: Continue.

### Step 2: Run the uninstall script

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/bun-runner.js ${CLAUDE_PLUGIN_ROOT}/dist/scripts/carbon-uninstall.js
```

This deletes the SQLite database and statusline script.

### Step 3: Clean up settings

Remove the `carbon@cnaught-plugins` plugin entry from settings files:

1. If `~/.claude/settings.json` has a `statusLine` config whose `command` contains `statusline-carbon`, remove the `statusLine` key.
2. Remove `"carbon@cnaught-plugins"` from the `enabledPlugins` object in any `.claude/settings.local.json` files (both `~/.claude/settings.local.json` and the project-level one in the current working directory). If `enabledPlugins` is empty after removal, remove the key entirely.
3. If `~/.claude/plugins/installed_plugins.json` exists, remove the `carbon@cnaught-plugins` entry from its `plugins` object.

### Step 4: Confirm completion

Let the user know the uninstall is complete and that they can re-install at any time by installing the plugin and running `/carbon:setup`.
