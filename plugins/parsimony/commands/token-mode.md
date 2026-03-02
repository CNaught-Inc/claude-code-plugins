---
description: Set token efficiency mode (efficient, ultra, off)
argument-hint: <mode>
allowed-tools: []
---

The user wants to change the token efficiency mode.

**Argument received:** $ARGUMENTS

Set the parsimony mode based on the argument:

- **efficient** (default): Smart tool choices, concise responses, full quality. Track savings.
- **ultra**: Aggressive compression. Diff-only output, inline fixes, require planning before any implementation. Terse responses — bullet points over prose.
- **off**: Normal Claude Code behavior. No token tracking.

If no argument is provided, report the current mode.

Confirm the mode change in one short line, e.g.: `Mode: ultra`
