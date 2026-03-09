# /carbon:rename-user

Update the organization name for anonymous carbon tracking.

## Instructions

### Step 1: Ask for an organization name

Use the `AskUserQuestion` tool to ask what company or organization name they'd like to use. This is the name associated with their synced sessions.

### Step 2: Run the rename script

```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-rename-user.ts --name "Their Organization"
```

Show the output to the user.

## Notes

- Always use the `AskUserQuestion` tool when asking the user a question
