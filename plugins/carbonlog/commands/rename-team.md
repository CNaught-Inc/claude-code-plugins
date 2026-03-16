# /carbonlog:rename-team

Update the team name for anonymous carbon tracking.

## Instructions

### Step 1: Ask for a team name

Use the `AskUserQuestion` tool to ask what team name they'd like to use. This is the name associated with their synced sessions.

### Step 2: Run the rename script

```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbonlog-rename-team.ts --name "Their Team"
```

Show the output to the user.

## Notes

- Always use the `AskUserQuestion` tool when asking the user a question
