---
description: Show token efficiency savings report for this session
argument-hint:
allowed-tools: []
---

The user wants to see a report of token savings from this session.

Output a report in this format:

```
Mode: [current mode] | Saved: ~[total] tokens | Cost savings: [model downgrades if any]
Breakdown: [technique (count): ~savings, ...]
Quality trade-offs: [none / list any]
```

Use these heuristics for estimates:
- Line-range read vs full file: ~(skipped_lines) * 10 tokens per instance
- Eliminated tool call: ~500-1,000 tokens each
- Glob/Grep instead of subagent: ~2,000-5,000 tokens each
- Avoided re-reading a file: ~file size in tokens
- Skipped preamble/summary: ~50-100 tokens each
- Haiku subagent instead of Opus: ~95% cost savings (cost, not tokens)
- Sonnet subagent instead of Opus: ~80% cost savings (cost, not tokens)

Only report techniques that were actually used in this session. If no savings were tracked, say so honestly.
