@AGENTS.md

## Gemini CLI Notes

- This file is auto-loaded by Gemini CLI as persistent context. The canonical instructions live in `AGENTS.md`.
- For scheduling, use Gemini CLI's `schedule` skill (or `CronCreate` in Claude Code, `loop` in Codex, etc.).
- For sub-agent dispatch, use Gemini CLI's `spawn_agent` equivalent.
- The `gemini-eval.mjs` script allows standalone evaluation via Gemini API without requiring the CLI (`node gemini-eval.mjs "JD text..."`).
