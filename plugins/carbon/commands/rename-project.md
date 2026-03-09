# /carbon:rename-project

This command has been removed. Project IDs are now automatically generated from the project path and cannot be customized.

## Instructions

Let the user know that project IDs are now automatically generated as a hash of the project path. There is no need to set or rename project names. Show them their current project ID by running:

```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-setup-check.ts
```
