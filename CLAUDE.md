@AGENTS.md

<!-- Anything below is Claude Code specific. The canonical instructions live in AGENTS.md. -->

## Claude Code Specifics

- The `/yoCareer` skill is loaded from `.claude/skills/yoCareer/SKILL.md` (mirrors `.agents/skills/yoCareer/SKILL.md`). Both files must stay in sync.
- For blocking user questions, use `AskUserQuestion`. For sub-agent dispatch, use the `Agent` / `Task` tool. For task tracking, use `TaskCreate` / `TaskUpdate` / `TaskList`.
- Recurring scans can be scheduled via `/loop` or `CronCreate` (e.g., `*/0 9 */3 * *` for "every 3 days at 9am").
- Plugin-aware reviewers (`/compound-engineering:ce-code-review`, `ce-adversarial-reviewer`, etc.) are available when the compound-engineering plugin is installed.
