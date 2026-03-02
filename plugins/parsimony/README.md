# Parsimony

A Claude Code plugin that reduces token usage by ~30% and speeds up responses by ~48% — without sacrificing output quality.

## Install

```bash
claude plugin install parsimony --marketplace cnaught-plugins
```

Or copy the skill directly:

```bash
mkdir -p ~/.claude/skills/parsimony
curl -o ~/.claude/skills/parsimony/SKILL.md \
  https://raw.githubusercontent.com/CNaught-Inc/claude-code-plugins/main/plugins/parsimony/skills/parsimony/SKILL.md
```

## What It Does

Parsimony teaches Claude Code to be token-efficient through three strategies:

1. **Input reduction** — Read only the lines you need, minimize tool calls, use efficient Grep modes
2. **Concise output** — No preamble, diff-only bug fixes, don't explain obvious code changes
3. **Smart model selection** — Use haiku/sonnet for subagents when Opus isn't needed

## Modes

| Mode | Behavior |
|------|----------|
| `efficient` (default) | Smart tool choices, concise responses, full quality |
| `ultra` | Aggressive compression, require planning, inline fixes only |
| `off` | Normal behavior, no tracking |

Switch modes: `/token-mode ultra`

View savings: `/token-report`

## Benchmark Results

Tested across 6 task types on Opus (controllable tokens only — excludes the cached system prompt):

| Task | Savings | Speed Gain |
|------|---------|------------|
| Summarize large file | 80.9% | 43% faster |
| Write TypeScript module | 55.4% | 58% faster |
| Debug Python function | 34.6% | 52% faster |
| Refactor JavaScript | 19.3% | 66% faster |
| Search/list files | 17.1% | 39% faster |
| Compare two files | 4.4% | 32% faster |
| **Average** | **30.0%** | **~48% faster** |

## How It Works

The biggest savings come from **input reduction**, not output compression:

- **Line-range reads**: Reading 60 lines instead of 500+ saves ~4,400 tokens per file
- **Fewer tool calls**: Each eliminated tool call saves ~500-1,000 tokens of overhead
- **Concise code**: Same functionality in fewer lines, no verbose explanations of obvious patterns

## Quality Guardrails

The skill explicitly protects output quality:

- Complete, correct code (never truncated)
- Thorough error handling
- All requested functionality
- Clear explanations when logic is non-obvious

## License

MIT — see [LICENSE](../../LICENSE)
