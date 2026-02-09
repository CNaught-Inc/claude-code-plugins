# /carbon:setup

Set up the CNaught carbon tracking plugin.

## Instructions

Follow these steps in order:

### Step 1: Run the base setup script

```bash
node scripts/bun-runner.js dist/scripts/carbon-setup.js
```

This will:
- Initialize the local SQLite database
- Install the statusline script to `~/.claude/statusline-carbon.mjs`
- Configure `~/.claude/settings.json` to enable the CO2 statusline
- Report current backend integration status

### Step 2: Check current state

```bash
node scripts/bun-runner.js dist/scripts/carbon-sync.js status
```

Note the values of `authConfigured`, `organizationId`, and `hasSubscription` from the JSON output. You'll use these to skip steps that are already complete.

### Step 3: Ask the user how they want to use the plugin

Present the user with these three options:

1. **Local only** — Track emissions locally and show them in the status bar. No account needed.
2. **Sync to CNaught** — Track locally AND sync session data to your CNaught account for a dashboard view. Requires a free CNaught account.
3. **Offset emissions** — Track, sync, AND automatically purchase carbon offsets for your usage. Requires a CNaught account with billing.

If the status from Step 2 shows `authConfigured` is `true`, mention that they already have an account connected and indicate which options are already set up.

Based on the user's choice:
- **Local only**: Skip to Step 7 (Verify setup). Setup is already complete from Step 1.
- **Sync to CNaught**: Continue to Step 4.
- **Offset emissions**: Continue to Step 4 (you will handle billing in Step 6).

### Step 4: Authenticate with CNaught

If `authConfigured` is already `true` from Step 2, skip to Step 5.

Run the browser OAuth flow:

```bash
node scripts/bun-runner.js dist/scripts/browser-oauth.js
```

This will open the user's browser for Auth0 login. Once they complete login, the tokens are stored locally and the organization is resolved automatically.

### Step 5: Create organization if needed

If `organizationId` is already set (not null) from Step 2, skip to Step 6.

```bash
node scripts/bun-runner.js dist/scripts/carbon-sync.js status
```

Check the `organizationId` field in the JSON output:

- If `organizationId` is not null: The organization already exists. Skip to Step 6.
- If `organizationId` is null: The user needs to create an organization.
  1. Tell the user: "No organization was found for your account. Let's create one."
  2. Ask the user: "What would you like to name your organization?" (This is typically a company name.)
  3. Once the user provides a name, run:
     ```bash
     node scripts/bun-runner.js dist/scripts/carbon-create-org.js "<org-name>"
     ```
     Make sure to quote the organization name in case it contains spaces.
  4. Verify the output JSON shows `"success": true`.
  5. If creation fails, tell the user the error and suggest they can try a different name or complete setup via the web app later.

### Step 6: Set up billing (Offset mode only)

**Skip this step entirely if the user chose "Sync to CNaught" in Step 3.** This step is only for users who chose "Offset emissions".

```bash
node scripts/bun-runner.js dist/scripts/carbon-sync.js status
```

Check the `hasSubscription` field in the output:

- If `hasSubscription` is `true`: Billing is already set up. Skip to Step 7.
- If `hasSubscription` is `false`: The organization needs to complete billing setup to enable automatic carbon offsetting.
  1. Tell the user: "Your organization needs to set up billing to enable automatic carbon offsetting. This takes about a minute."
  2. Share the `onboardingUrl` from the status output and ask the user to open it in their browser to complete the setup.
  3. Once the user confirms they've completed the onboarding, re-run `node scripts/bun-runner.js dist/scripts/carbon-sync.js status` to verify `hasSubscription` is now `true`.
  4. If it's still `false`, let the user know they can complete this later and continue with setup.
- If `hasSubscription` is `null`: Could not check (e.g. network issue). Let the user know and continue.

### Step 7: Ask about historical sessions

**Skip this step if the user chose "Local only" in Step 3.**

Ask the user: "Would you like to sync your previous Claude Code sessions? This may take a moment if you have many sessions."

- If **yes**: Run the historical sync:
  ```bash
  node scripts/bun-runner.js dist/scripts/carbon-sync.js sync-all
  ```
  This will recover all pre-existing transcript files and sync them to the backend. Let the user know this may take a moment.

- If **no**: Skip this step. Only new sessions going forward will be tracked.

### Step 8: Verify setup

```bash
node scripts/bun-runner.js dist/scripts/carbon-status.js
```

Show the output to the user and confirm what's set up based on their chosen mode:
- **Local only**: Database is initialized, statusline is installed, CO2 tracking is active.
- **Sync to CNaught**: All of the above, plus backend integration shows "Connected".
- **Offset emissions**: All of the above, plus billing is configured for automatic offsetting.

## Notes

- The plugin works in all three modes — you can start with local-only and upgrade later by re-running `/carbon:setup`
- Backend integration enables automatic session syncing to CNaught
- Sessions are synced automatically at the end of each Claude Code session (if authenticated)
- You can run setup again at any time to change your mode or reconfigure
- If tokens expire, re-run `/carbon:setup` to re-authenticate
- To sync historical sessions later, run: `node scripts/bun-runner.js dist/scripts/carbon-sync.js sync-all`
