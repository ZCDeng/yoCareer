# yoCareer — Progress

> 项目进度索引。详细 plan/brainstorm 见 `docs/plans/` 与 `docs/brainstorms/`。

**Version:** v2.0.0
**Last sync:** 2026-05-10
**Default branch:** main

## 活跃工作

_无_。v2 重构全部 9 个 implementation units 已 ship，中文 README 同步完成，Dependabot PR 全部合并。

---

## v2 重构完成 (2026-05-10)

### 交付总览

| Phase | Units | PR | 状态 |
|---|---|---|---|
| A — Foundation | U1 SQLite + U2 Daemon | #33, #34 | Merged |
| B — CLI 改造 | U3 Domain REST + U4 CLI bridge | #35, #36 | Merged |
| C — UI | U5 Web SPA + U6 Mirofish tokens | #37, #38 | Merged |
| D — Extension | U7 Browser Extension | #37 | Merged |
| E — 边界 + 测试 + 文档 | U8 CN boundary + U9 test/docs | #38, #39, #40 | Merged |

### U1-U4 详情

| 完成日 | Unit | PR | Highlights |
|---|---|---|---|
| 2026-05-10 | U1 SQLite foundation | #33 | `better-sqlite3` + WAL schema（profiles/portals/signals/applications/evaluations/tasks）+ 4 状态机 YAML + stale propagation DAG + `lib/v1-detect.mjs` |
| 2026-05-10 | U2 Daemon HTTP | #34 | localhost:8650 REST + SSE broadcast + `x-yo-token` auth + 6 位 pairing code + `lib/ensure-daemon.mjs` |
| 2026-05-10 | U3 Domain REST | #35 | 6 实体 CRUD 路由 + tasks 路由 + `task_runner` cooperative checkpoint + `pdf-extract.mjs` 迁移到 daemon HTTP |
| 2026-05-10 | U4 CLI bridge | #36 | 11 个 `.mjs` 入口脚本改为 daemon HTTP 客户端（`lib/daemon-client.mjs`）；`daemon-cli.mjs` 提供 `start/stop/status` |

### U5-U9 详情

| 完成日 | Unit | PR | Highlights |
|---|---|---|---|
| 2026-05-10 | U5 Web SPA | #37 | Dark-first 模块卡片（Profile/Portals/Signals/Applications/Evaluations）+ Fuse.js Cmd+K + SSE 实时更新 + `web-ui/server.mjs` |
| 2026-05-10 | U6 Mirofish tokens | #38 | 3-tier CSS design tokens（`--mf-*` primitive → semantic → component）+ `templates/mirofish-system/` 4 文件矩阵 + light theme override |
| 2026-05-10 | U7 Extension | #37 | Manifest V3 + content scripts（BOSS/拉勾/智联）+ popup + 6 位 pairing + service worker HTTP 通信 |
| 2026-05-10 | U8 CN boundary | #38 | 物理删除 `modes/{de,fr,ja,pt,ru}/` + 5 非 CN READMEs；`templates/capabilities.yml` 创建；v1 升级检测 |
| 2026-05-10 | U9 Test + docs | #38, #39, #40 | test-all.mjs Section 16（v2 架构检查）; docs/ARCHITECTURE.md/SETUP.md/SCRIPTS.md 更新; README.cn.md/README.zh-TW.md 同步 |

---

## 近期完成 (2026-05-08 → 2026-05-09)

### Ideation 落地 (PRs #20–#22)

| 完成日 | Plan | PR | Highlights |
|---|---|---|---|
| 2026-05-09 | [003 risk-tiers + Block G](docs/plans/2026-05-08-003-feat-risk-tiers-blockg-lookup-plan.md) | [#20](https://github.com/ZCDeng/yoCareer/pull/20) | `templates/risk-tiers.yml` 17 条信号 + 中文 evaluate「查表基线 + LLM 补充」+ test-all Section 12 + CodeQL 修复 (`generate-pdf.mjs` URL hostname check) |
| 2026-05-08 | [002 CJK CV + ATS selftest](docs/plans/2026-05-08-002-feat-cjk-cv-ats-selftest-plan.md) | merged via #20 | `templates/cv-template.cn.{html,tex}` + `tests/cv-ats-selftest.mjs` + canary fixture |
| 2026-05-08 | [001 zh-cn modes parity](docs/plans/2026-05-08-001-feat-zh-cn-modes-parity-plan.md) | merged via #20（#19 closed as superseded） | `modes/zh-cn/{apply,pipeline,README,signal-review}.md` + `templates/portals.cn.example.yml` 等 |

### Code review 后续 PRs (PRs #23–#26)

经 `/compound-engineering:ce-code-review` 8 reviewer 审计（run-id 20260509-143000），20 项 finding 分四批落地：

| PR | 范围 | Highlights |
|---|---|---|
| [#23](https://github.com/ZCDeng/yoCareer/pull/23) PR-A | 4 项 correctness | #1 ATS field-order 同义反复 → 改为 header-fixed/body-flexible 设计；#6 Section 12 stdout 捕获；#15 parseRegexPattern 拒绝空 //；#17 generate-latex mkdtemp envelope 形状 |
| [#24](https://github.com/ZCDeng/yoCareer/pull/24) PR-B | 3 项 agent-native 接通 | #4 modes/pdf.md zh-cn → cv-template.cn 选择规则 + Step 16 ATS selftest；#5 SKILL.md (.agents/.claude) 加 zh-cn 入口；#20 profile.example.yml 注释 `language` 段 |
| [#25](https://github.com/ZCDeng/yoCareer/pull/25) PR-D | CI 强化 | #13 `tests/url-allowlist-selftest.mjs` 18 cases regression；#8 Section 11 CI 模式 hard-fail + workflow 装 poppler/Playwright；#18 try/finally + canary PDF gitignore |
| [#26](https://github.com/ZCDeng/yoCareer/pull/26) PR-C | risk-tiers 校准 | #3 删除 `weight` 字段（plan 003 R3 superseded：scoring 公式只用 tier）；#2 false positive 收窄（lookbehind 排除 vendor-management / 反 996 / 法务语境 / 客户押金 / 12薪+奖金）；#10 evaluate.md 顺序明确化（先查表后 LLM）+ 强制结构化证据节；#11 surfacing `signal_count` 区分单点 vs 饱和 |

---

## 已 kill 的 ideation

| Date | Idea | 原因 |
|---|---|---|
| 2026-05-09 | #4 私域信号入栈完整管道 | 产品形态不通用；用户自评"过眼就忘"暴露这是行为改变问题、非工具问题。详见 `docs/ideation/2026-05-08-yocareer-cn-optimization.md` |

---

## 关键架构决策

- **v2 重构：Web app + CLI 混合架构**（v2.0.0）：9 个 implementation units 分 5 phase 交付；daemon 为中心节点（localhost:8650 REST + SSE），所有写入收敛；CLI 脚本改为 daemon HTTP 薄封装；Web SPA 为 vanilla JS + Fuse.js Cmd+K + SSE；Extension 为 Manifest V3 + pairing code 认证
- **agentskills.io Option B 迁移** (#16, #18)：单一 SKILL.md 源 + 多 CLI 镜像（Claude / Codex / Gemini / OpenCode / Qwen / Copilot），routing 表跨文件一致性靠 `test-all.mjs` 守门
- **China-first provider 架构**：scanner 顺序 = `company_page` → `manual_signal_import` → `reach_signal_search` → `manual_only`；BOSS/智联/猎聘走人工导入，杜绝反爬冲突
- **risk-tiers 结构化查表**（v1.6.0）：中文 evaluate 评分由纯 LLM 推理升级为「先查表后 LLM」两阶段（PR #26 后顺序强制化）；schema 只保留 `tier`（PR #26 删除未消费的 `weight`）；selftest 含 must-NOT-match fixtures 防误匹配回归
- **CI 实运行 ATS 链路**（PR #25）：workflow 安装 poppler-utils + Playwright Chromium，Section 11 在 CI 模式 hard-fail，告别"silent skip"
- **测试可信度**（PR #23）：移除 `checkFieldOrder` 同义反复检查，改为 header-fixed/body-flexible，真正能捕捉 sidebar 拆分 / 头部错位
- **Mirofish 设计系统**（v2.0.0）：3-tier CSS tokens（primitive → semantic → component）；dark-first 默认；light override via `prefers-color-scheme`；4 文件设计矩阵（themes/layouts/components/checklist）

---

## 数据契约红线（务必）

- 用户层 `cv.md`、`config/profile.yml`、`modes/_profile.md`、`portals.yml`、`data/*`、`reports/*`、`output/*` — **永不**自动覆盖
- 系统层 `modes/_shared.md` 等 — 用户个性化禁止写入，统一落到 `modes/_profile.md` 或 `config/profile.yml`
- 任何 plan 落地必须通过 `node test-all.mjs --quick`（151+ 项）才能 push

---

## 遗留与下一步

**v2 ship 后待办（30 天观察期内评估）：**
- [x] `docs/solutions/` 首批 compound learnings 沉淀（URL allowlist hostname 校验、structured YAML lookup as LLM tie-breaker、ATS pdftotext round-trip selftest、CJK LaTeX xeCJK 字体栈、CI skip-on-missing-tool 模式）
- [x] 浏览器扩展商店上架材料已备齐（Edge Add-ons / 极简插件商店 / Crx搜搜）— 待提交审核
- [ ] Mirofish hero 占位符 SVG 替换为最终设计师素材
- [ ] Dashboard Go TUI 用户量评估 — 如持续过低，发起 deprecation RFC

**Code review 残留（低优先，v1.6.x 未做，延续到 v2）：**
- #7 generate-latex.mjs pdflatex/xelatex 编译块去重（safe_auto, P2）
- #9 generate-pdf.mjs `data:` URI MIME 白名单收紧（P2 advisory；当前 JS-disabled 缓解）
- #12 evaluate.md 扣分常量 (2/1.5/1/0.5) 移入 risk-tiers.yml 顶层 deductions map（P2 advisory，新增 tier 时减少同步点）
- #14 cv-ats-selftest.mjs 字节范围 dead-code regex 清理（P3 advisory）
- #19 cv-ats-selftest.mjs `--name` missing 改 warn（P3 advisory）

**新功能候选（保持 Unexplored，等用户压力）：**
- [ ] risk-tiers.yml 信号库后续扩展（外包子型、社保异常、合同条款等）
- [ ] 用户层覆盖 risk-tiers 的能力（用户写自己的 red flag 到 profile.yml）
- [ ] ideation #5（零 LLM 初筛 + daily 仪表盘）/ #6（贝叶斯反馈环）/ #7（proof library）

---

## 文档索引

- **v2 重构 plan（已完成）**: [docs/plans/2026-05-10-001-feat-yocareer-v2-refactor-plan.md](docs/plans/2026-05-10-001-feat-yocareer-v2-refactor-plan.md)
- Brainstorms: `docs/brainstorms/`
- Plans: `docs/plans/`
- Architecture diagrams: `docs/architecture-pipeline.drawio`、`docs/code-review-pipeline.drawio`、`docs/getting-started.drawio`
- Aditly bridge integration: `docs/ADITLY_INTEGRATION.md`
