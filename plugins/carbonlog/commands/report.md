# /carbonlog:report

Generate a carbon emissions report.

## Usage

```
/carbonlog:report
```

## What it shows

### Summary (all-time)
- Total CO₂ emissions (kg)
- Total energy consumption (kWh)
- Total sessions, tokens (with output token count)

### Equivalents
- Miles driven in a car
- Days of home energy usage

### By Model
- Breakdown of CO₂ by model with progress bars, session counts, and percentages

### By Project (if more than one project)
- Breakdown of CO₂ by project with progress bars and percentages

### Sync (if enabled)
- Display name and pending sync count

## Script

```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbonlog-report.ts
```
