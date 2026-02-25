# /carbon:rename-project

Update the project name used for carbon tracking.

## Instructions

### Step 1: Ask for a new project name

Ask the user what they'd like to name this project. Let them know that by default, the project is identified by the GitHub repo (e.g., `cnaught/claude-code-plugins`) if available, otherwise it falls back to a local hash. They can provide a custom name to override this.

If they want to reset to the default (auto-detected from git), they can say "reset" or "default".

### Step 2: Run the rename-project script

If the user provided a name:
```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-rename-project.ts --name "Their Project Name"
```

If the user wants to reset to the default:
```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-rename-project.ts --reset
```

Show the output to the user.
