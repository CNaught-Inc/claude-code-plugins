# /carbon:status

Show current carbon tracking status.

## Instructions

Run the status script and display the output to the user:

```bash
node scripts/bun-runner.js dist/scripts/carbon-status.js
```

## What it shows

### Local Statistics
- Total sessions tracked
- Total tokens used (input/output/cache creation/cache read)
- Total energy consumption (Wh)
- Total CO2 emissions (grams)

### Backend Integration
- Organization ID
- Connection status (Connected / Connected (will auto-refresh) / Token expired / Not configured)
- Last updated time

### Sync Status (if connected)
- Number of unsynced sessions
- Oldest unsynced session time

## Example Output

```
========================================
  CNaught Carbon Tracker Status
========================================

Local Statistics:
----------------------------------------
  Sessions tracked:    42
  Total tokens:        1,234,567
    Input:             456,789
    Output:            234,567
    Cache creation:    345,678
    Cache read:        197,533
  Energy consumed:     12.34 Wh
  CO2 emitted:        5.67g

Backend Integration:
----------------------------------------
  Organization:        org_abc123
  Status:              Connected
  Last updated:        2 minutes ago

Sync Status:
----------------------------------------
  Unsynced sessions:   3
  Oldest unsynced:     1 hour ago

========================================
```

## Troubleshooting

- If status shows "Not configured", run `/carbon:setup` to authenticate
- If status shows "Token expired", run `/carbon:setup` to re-authenticate
- If there are unsynced sessions, they will automatically sync at the end of your next session, or you can run `/carbon:sync` to sync manually
