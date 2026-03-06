# /carbon:cleanup-cache

Clean up old cached plugin versions to free disk space.

## Background

Claude Code downloads each plugin version into a separate directory at `~/.claude/plugins/cache/` but never removes old versions. Over time this accumulates stale copies that waste disk space.

This is a known issue:
- https://github.com/anthropics/claude-code/issues/16453
- https://github.com/anthropics/claude-code/issues/25753

## What it does

Removes old cached versions of this plugin, keeping:
- The current version (in use by this session)
- The most recent prior version (may still be referenced by another session's statusline)

## Script

```bash
npx -y bun ${CLAUDE_PLUGIN_ROOT}/src/scripts/carbon-cleanup-cache.ts ${CLAUDE_PLUGIN_ROOT}
```

Display the results to the user. The script outputs JSON with `removed` (count), `kept` (version list), and `deleted` (version list) fields.
