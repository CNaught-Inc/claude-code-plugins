# /carbon:status

Show current carbon tracking status.

## Instructions

Run the status script and display the output to the user:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/bun-runner.js ${CLAUDE_PLUGIN_ROOT}/dist/scripts/carbon-status.js
```

## What it shows

### Local Statistics
- Total sessions tracked
- Total tokens used (input/output/cache creation/cache read)
- Total energy consumption (Wh)
- Total CO2 emissions (grams)

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

========================================
```

## Troubleshooting

- If the command fails, run `/carbon:setup` to initialize the tracker
