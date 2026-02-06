# /carbon:setup

Set up the CNaught carbon tracking plugin.

## Instructions

Follow these steps in order:

### Step 1: Run the base setup script

```bash
node dist/scripts/carbon-setup.js
```

This will:
- Initialize the local SQLite database
- Install the statusline script to `~/.claude/statusline-carbon.mjs`
- Configure `~/.claude/settings.json` to enable the CO2 statusline
- Report current backend integration status

### Step 2: Check if authentication is already configured

```bash
node dist/scripts/carbon-sync.js status
```

If `authConfigured` is `true`, skip to Step 4.

### Step 3: Authenticate with CNaught

Run the browser OAuth flow:

```bash
node dist/scripts/browser-oauth.js
```

This will open the user's browser for Auth0 login. Once they complete login, the tokens are stored locally and the organization is resolved automatically.

### Step 4: Ask about historical sessions

Ask the user: "Would you like to sync your previous Claude Code sessions? This may take a moment if you have many sessions."

- If **yes**: Run the historical sync:
  ```bash
  node dist/scripts/carbon-sync.js sync-all
  ```
  This will recover all pre-existing transcript files and sync them to the backend. Let the user know this may take a moment.

- If **no**: Skip this step. Only new sessions going forward will be tracked.

### Step 5: Verify setup

```bash
node dist/scripts/carbon-status.js
```

Show the output to the user and confirm that:
- The database is initialized
- The statusline is installed
- Backend integration shows "Connected" (if they authenticated)

## Notes

- The plugin works standalone for local tracking without backend integration
- Backend integration enables automatic session syncing to CNaught for carbon offsetting
- Sessions are synced automatically at the end of each Claude Code session
- You can run setup again at any time to reconfigure
- If tokens expire, re-run `/carbon:setup` to re-authenticate
- To sync historical sessions later, run: `node dist/scripts/carbon-sync.js sync-all`
