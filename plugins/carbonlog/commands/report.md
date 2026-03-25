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
- Pad model names to 22 characters, project names to the length of the longest project name
- Right-align CO2 values (pad kg values to 8 characters wide including "kg" suffix)
- Format large numbers with commas (e.g. 12,965,819)
- Use markdown **bold** for key values: CO₂ and Energy amounts, miles driven and home energy days, and the CO2 kg values in each model/project row
- Omit any section where the JSON value is `null`

### Template

```
╔══════════════════════════════════════════════════╗
║       [Cø] CNaught Climate Impact Report         ║
╚══════════════════════════════════════════════════╝

Summary  (since {summary.tracking_since})
──────────────────────────────────────────────────

  CO₂    **{summary.co2_kg}** kg
  Energy **{summary.energy_kwh}** kWh
  Sessions: {summary.sessions} · Tokens: {summary.total_tokens} ({summary.output_tokens} output)
  Emissions estimated from output tokens

Equivalents
──────────────────────────────────────────────────

  🚗  Miles driven       **{equivalents.miles_driven} miles**
  🏠  Home energy         **{equivalents.home_energy_days} days**

By Model
──────────────────────────────────────────────────

  [■■■■■··········] {model_name}  **{co2}kg**  {sessions} sessions · {pct}%
  (one row per model, sorted by CO2 descending)

By Project
──────────────────────────────────────────────────

  [■■■■■■■········] {project_name}  **{co2}kg**  {pct}%
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
