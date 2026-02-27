# /carbon:report

Generate a carbon emissions report.

## Usage

```
/carbon:report
```

## What it shows

### All-Time Project Statistics
- Total sessions tracked
- Total tokens used (input/output/cache creation/cache read)
- Total energy consumption (Wh)
- Total CO2 emissions (grams)

### 7-Day Summary
- Number of sessions
- Total tokens processed
- Energy consumption
- CO2 emissions

### Relatable Equivalents
- Kilometers driven in a car
- Smartphone charges
- Hours of LED light usage
- Google searches

### Project Breakdown (optional)
- Emissions by project/repository

## Script

```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-report.ts
```
