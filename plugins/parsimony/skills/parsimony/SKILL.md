---
name: parsimony
description: Use when starting any session or task to minimize token waste without sacrificing output quality. Use when costs feel high, sessions are long, or codebases are large.
---

# Parsimony

Waste zero tokens on ceremony. Spend every token on value. Track savings via `/token-report`.

**Modes** — set via `/token-mode <mode>`, default **efficient**:
- **efficient**: smart tool/response choices, full quality
- **ultra**: aggressive — diff-only output, inline fixes, plan before any implementation
- **off**: normal behavior, no tracking

## Tool Rules — Biggest Savings Come From Input Reduction

**Minimize what you feed the model — this is where most tokens are spent.**

- **Read only what you need**: use `offset`/`limit` on Read. For summaries, read the first 50-60 lines (overview + when-to-use), not the full file. Each skipped line saves ~10 tokens.
- **One tool call, not many**: combine searches into a single well-crafted Grep. Each eliminated tool call saves ~500-1,000 tokens of overhead.
- **Grep efficiently**: use `files_with_matches` when you only need paths, `head_limit` to cap results. Never let Grep return unbounded content.
- Glob/Grep directly — never spawn subagents for simple searches
- Batch independent tool calls in parallel
- Never re-read files already in context

**Subagent models**: haiku for lookups, sonnet for standard implementation, Opus only for complex reasoning.

## Response Rules

- No preamble, no restating the request, no post-action summaries
- Lists/search results: one line per item — filename + brief note, not paragraphs
- **Bug fixes**: show only the changed lines with context, not the entire corrected function. Format: `line X: \`old\` → \`new\``
- **Refactors**: show the new code only — don't explain obvious improvements (filter/map, Set, arrow functions). Explain only non-obvious choices.
- **Summaries**: match detail to scope. "Quick summary" = 3-5 sentences max.
- **ultra** mode: inline fixes (`\`append(k,v)\` → \`append((k,v))\``), skip corrected code blocks entirely when the fix is clear from the description

## Code Quality

- Elegant, concise — fewer lines that do more
- Built-in language features over manual implementations
- DRY without over-abstracting

## Planning

- Before implementation touching 3+ files or new patterns: "Do you have a plan, or should we make one?"
- **ultra**: require a plan for anything non-trivial

## Token Ledger

Track savings mentally. **High-value** (prioritize these): line-range read ~(skipped_lines)*10 tokens, eliminated tool call ~500-1k, Grep vs subagent ~2k-5k, avoided re-read ~file size. **Low-value**: skipped preamble ~50-100. Model downgrades save cost (haiku ~95%, sonnet ~80%), not tokens.

## `/token-report`

```
Mode: [mode] | Saved: ~[total] tokens | Cost savings: [model downgrades]
Breakdown: [technique (count): ~savings, ...]
Quality trade-offs: [none / list]
```

## Never Sacrifice

Complete correct code. Thorough error handling. All requested functionality. Clear explanations when logic is non-obvious.
