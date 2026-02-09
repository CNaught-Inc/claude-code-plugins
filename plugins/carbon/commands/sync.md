# /carbon:sync

Manually sync unsynced carbon tracking sessions to the CNaught backend.

## Instructions

Run the sync script:

```bash
node scripts/bun-runner.js dist/scripts/carbon-sync.js
```

The script will:
1. Check if authenticated (if not, tell user to run `/carbon:setup`)
2. Find all unsynced sessions
3. Sync them to the backend via GraphQL
4. Report results

## Example Output

```
Syncing 3 session(s) to backend...
Synced 3 session(s) successfully.
```

Or if already synced:

```
All sessions are already synced.
```

## Notes

- Sessions are normally synced automatically when a Claude Code session ends
- Use this command if automatic sync failed or to force an immediate sync
- The `/carbon:status` command shows how many sessions are pending sync
