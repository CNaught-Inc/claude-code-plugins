# /carbonlog:report

Generate a carbon emissions report.

## Script

```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbonlog-report.ts --json
```

## Instructions

Run the script above to get report data as JSON. Then format and display the report as plain text (NOT in a code block, NOT using markdown tables or headers). Match the visual style shown in the template below exactly.

**IMPORTANT**: Output ONLY the formatted report. Do not add any additional commentary, summary, or explanation before or after it.

### Formatting rules

- Use `■` for filled progress bar segments and `·` for empty ones, 15 characters wide, wrapped in `[]`
- Calculate filled segments as: `round((item_co2 / max_co2_in_section) * 15)`
- Format large numbers with commas (e.g. 12,965,819)
- Use markdown bold for key values: CO₂ and Energy amounts, miles driven and home energy days, and the CO2 kg values in each model/project row.
- Omit any section where the JSON value is `null`

Column alignment (critical — every row in a section must have its columns at the same character position):
- **By Model**: pad model names to the width of the longest model name. Right-pad kg values to 7 chars total. Right-pad session counts to 3 digits. Right-pad percentages to 2 digits.
- **By Project**: pad project names to the width of the longest project name. Right-pad kg values to 7 chars total. Right-pad percentages to 2 digits.
- **Bold + alignment**: alignment padding spaces must go BEFORE the `**` marker, never inside it. Example: `  **4.36kg**` is correct, `**  4.36kg**` is wrong. The `**` must be immediately adjacent to the value with no spaces inside.

### Template

```
╔══════════════════════════════════════════════════╗
║       [Cø] CNaught Climate Impact Report         ║
╚══════════════════════════════════════════════════╝

Summary  (since {summary.tracking_since})
──────────────────────────────────────────────────

  CO₂    {summary.co2_kg} kg
  Energy {summary.energy_kwh} kWh
  Sessions: {summary.sessions} · Tokens: {summary.total_tokens} ({summary.output_tokens} output)
  Emissions estimated from output tokens

Equivalents
──────────────────────────────────────────────────

  🚗  Miles driven       {equivalents.miles_driven} miles
  🏠  Home energy         {equivalents.home_energy_days} days

By Model
──────────────────────────────────────────────────

  [■■■■■··········] {model_name}  {co2}kg  {sessions} sessions · {pct}%
  (one row per model, sorted by CO2 descending)

By Project
──────────────────────────────────────────────────

  [■■■■■■■········] {project_name}  {co2}kg  {pct}%
  (one row per project, sorted by CO2 descending)

Sync
──────────────────────────────────────────────────

  Dashboard:     {sync.dashboard_url}

  Team:          {sync.team}
  Database:      {sync.database_path}
  Pending sync:  {sync.pending_count} session(s)

Methodology: https://github.com/CNaught-Inc/claude-code-plugins/blob/main/plugins/carbonlog/methodology.md
Questions or feedback? Email feedback@cnaught.com
```
