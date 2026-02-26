# /carbon:uninstall

Uninstall the CNaught carbon tracking plugin.

## Instructions

### Step 1: Confirm with the user

Ask the user to confirm: "This will remove all carbon tracking data and the plugin configuration. Continue?"

- If **no**: Stop here.
- If **yes**: Continue.

### Step 2: Run the uninstall script

```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-uninstall.ts
```

This removes all sessions and deletes the database.

### Step 3: Clean up settings

Read `~/.claude/plugins/installed_plugins.json` to find all `carbon@cnaught-plugins` entries and their `projectPath` values.

For each entry that has a `projectPath`:
1. In `<projectPath>/.claude/settings.local.json`:
   - If there is a `_carbonOriginalStatusLine` key, restore it as the `statusLine` value and remove the `_carbonOriginalStatusLine` key.
   - Otherwise, if the `statusLine` config's `command` contains `carbon-statusline` or `statusline-wrapper`, remove the `statusLine` key.
   - Remove `"carbon@cnaught-plugins"` from the `enabledPlugins` object. If `enabledPlugins` is empty after removal, remove the key entirely.

Then clean up global settings:
1. In `~/.claude/settings.json`: apply the same statusLine cleanup logic (restore original or remove carbon statusline). Remove `"carbon@cnaught-plugins"` from `enabledPlugins`.
2. In `~/.claude/settings.local.json`: remove `"carbon@cnaught-plugins"` from `enabledPlugins` if present.
3. Remove all `carbon@cnaught-plugins` entries from `~/.claude/plugins/installed_plugins.json`.
4. Delete `~/.claude/statusline-carbon.mjs` if it exists (legacy file).

### Step 4: Confirm completion

Let the user know the uninstall is complete and that they can re-install at any time by installing the plugin and running `/carbon:setup`.
