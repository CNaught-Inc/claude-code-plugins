# /carbon:report

Generate a carbon emissions report for recent usage.

## Usage

```
/carbon:report
```

## What it shows

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

### Daily Breakdown
- Per-day emissions chart
- Peak usage days

### Project Breakdown (optional)
- Emissions by project/repository

## Script

```bash
node scripts/bun-runner.js dist/scripts/carbon-report.js
```

## Example Output

```
CNaught Carbon Emissions Report (Last 7 Days)
=============================================

Summary:
  Sessions: 28
  Tokens: 856,432
  Energy: 8.56 Wh
  CO2: 3.94g

Equivalents:
  This is roughly equivalent to:
  - Driving 0.03 km in a car
  - Charging your phone 0.3 times
  - Running an LED bulb for 52 minutes

Daily Breakdown:
  Mon: 0.52g  ####
  Tue: 0.71g  #####
  Wed: 0.45g  ###
  Thu: 0.89g  #######
  Fri: 0.62g  ####
  Sat: 0.38g  ###
  Sun: 0.37g  ###

Projects:
  frontend-monorepo              2.45g (62%)
  backend-api                    1.12g (28%)
  other                          0.37g (10%)
```
