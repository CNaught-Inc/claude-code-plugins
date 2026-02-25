# /carbon:rename-user

Update your display name for anonymous carbon tracking.

## Instructions

### Step 1: Ask for a new name

Ask the user what they'd like their new display name to be. Let them know they can also skip to get a new randomly generated name (e.g., "Curious Penguin").

### Step 2: Run the rename script

If the user provided a name:
```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-rename-user.ts --name "Their Name"
```

If the user wants a random name:
```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-rename-user.ts
```

Show the output to the user.
