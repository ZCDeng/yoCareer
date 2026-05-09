# yoCareer — Progress

> 项目进度索引。详细 plan/brainstorm 见 `docs/plans/` 与 `docs/brainstorms/`。

**Version:** v1.6.0
**Last sync:** 2026-05-09
**Default branch:** main

## 活跃工作

| 状态 | Plan | PR | 备注 |
|---|---|---|---|
| 🟢 in review | 001 zh-cn-modes-parity | [#19 OPEN](https://github.com/ZCDeng/yoCareer/pull/19) | 补齐中文模式到 5 文件 parity + 国内市场默认配置；plan 文档已 mark completed，PR 待合 |

## 近期完成 (2026-05-08 → 2026-05-09)

| 完成日 | Plan | PR | Highlights |
|---|---|---|---|
| 2026-05-09 | [003 risk-tiers + Block G](docs/plans/2026-05-08-003-feat-risk-tiers-blockg-lookup-plan.md) | [#20](https://github.com/ZCDeng/yoCareer/pull/20) | `templates/risk-tiers.yml` 17 条信号 + 中文 evaluate「查表基线 + LLM 补充」+ test-all Section 12 + CodeQL 修复 (`generate-pdf.mjs` URL hostname check) |
| 2026-05-08 | [002 CJK CV + ATS selftest](docs/plans/2026-05-08-002-feat-cjk-cv-ats-selftest-plan.md) | merged via #20 | `templates/cv-template.cn.{html,tex}` + `tests/cv-ats-selftest.mjs` + canary fixture |
| 2026-05-08 | [001 zh-cn modes parity](docs/plans/2026-05-08-001-feat-zh-cn-modes-parity-plan.md) | #19 (open) / 内容预览于 #20 | `modes/zh-cn/{apply,pipeline,README,signal-review}.md` + `templates/portals.cn.example.yml` 等 |

## 关键架构决策

- **agentskills.io Option B 迁移** (#16, #18)：单一 SKILL.md 源 + 多 CLI 镜像（Claude / Codex / Gemini / OpenCode / Qwen / Copilot），routing 表跨文件一致性靠 `test-all.mjs` 守门
- **China-first provider 架构**：scanner 顺序 = `company_page` → `manual_signal_import` → `reach_signal_search` → `manual_only`；BOSS/智联/猎聘走人工导入，杜绝反爬冲突
- **risk-tiers 结构化查表**（v1.6.0）：中文 evaluate 评分由纯 LLM 推理升级为「YAML 信号库 + LLM 调整边界」混合模式，可审计、低成本、扩展信号库不需改 mode 文件

## 数据契约红线（务必）

- 用户层 `cv.md`、`config/profile.yml`、`modes/_profile.md`、`portals.yml`、`data/*`、`reports/*`、`output/*` — **永不**自动覆盖
- 系统层 `modes/_shared.md` 等 — 用户个性化禁止写入，统一落到 `modes/_profile.md` 或 `config/profile.yml`
- 任何 plan 落地必须通过 `node test-all.mjs --quick`（98 项）才能 push

## 遗留与下一步

- [ ] PR #19 review 与合并（zh-cn modes parity）
- [ ] risk-tiers.yml 信号库后续扩展（外包子型、社保异常、合同条款等）→ 通过独立 PR
- [ ] 用户层覆盖 risk-tiers 的能力（用户写自己的 red flag 到 profile.yml）— 已在 plan 003 备注，未实现

## 文档索引

- Brainstorms: `docs/brainstorms/`
- Plans: `docs/plans/`
- Architecture diagrams: `docs/architecture-pipeline.drawio`、`docs/code-review-pipeline.drawio`、`docs/getting-started.drawio`
- Aditly bridge integration: `docs/ADITLY_INTEGRATION.md`
