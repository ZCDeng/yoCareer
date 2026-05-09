---
date: 2026-05-09
topic: cv-system-pdf-inbound-cn-polish
focus: 1) 中文用户支持强化 2) 简历生成增强（融合 guizang-ppt） 3) PDF 提取增强 4) 一键桌面应用
mode: repo-grounded
predecessor: docs/ideation/2026-05-08-yocareer-cn-optimization.md
---

# Ideation: yoCareer 中文用户强化（CV 设计系统 + PDF 入栈 + zh-cn polish）

## Grounding Context

刚完成的 ce-code-review campaign（PRs #23/#24/#25/#26）合上后，main 干净，遗留只剩 5 项低优 polish。本轮 ideation 探索新一轮强化方向，覆盖 4 个面：

1. **中文用户支持** — 已有 zh-cn modes、CJK CV templates、risk-tiers、agent 路由（含 PR-C 校准），但仍有体感缺口
2. **简历生成增强** — 借鉴本机已安装但 disabled 的 guizang-ppt 设计系统（`~/.claude/skills.disabled/guizang-ppt/`）
3. **PDF 提取增强** — yoCareer 当前几乎不读 PDF，只在 ATS selftest 用 pdftotext 验证自家产物
4. **一键桌面应用** — 当前是 CLI + Go TUI dashboard，无 GUI、无安装包

### Repo 现状

- **zh-cn**: 6 文件（含独家 `signal-review.md`），与 de/fr/ja parity ✅；但 `modes/zh-cn/_shared.md` 仅 31 行 vs EN 13KB，深度差 2.3×；**没有 `modes/zh-cn/pdf.md`** —— agent 渲染 CN CV 时会跨进 Spanish `modes/pdf.md`
- **CV 渲染**: `generate-pdf.mjs` (Playwright) + `generate-latex.mjs` (xelatex/pdflatex/tectonic) 双路；`cv-template.cn.{html,tex}` 用 Google Fonts Noto Sans SC（**仓库 `fonts/` 目录无任何 CJK 字体本地副本**）
- **PDF 提取**: 仅 `tests/cv-ats-selftest.mjs` 用 pdftotext 验证自家 CV 输出。**0 个 inbound PDF reading 路径**
- **Desktop**: `dashboard/` 是 Go Bubble Tea TUI；无 npm bin alias；release-please 只 bump 版本不出二进制

### guizang-ppt 解构（disabled skill at `~/.claude/skills.disabled/guizang-ppt/`）

| 可借鉴 | 不可借鉴 |
|---|---|
| **5 themes 锁定**（`themes.md`，无自定义 hex） | WebGL 流体背景（PDF 无法捕获） |
| **10 pre-baked layouts**（`layouts.md`） | Swipe nav / ESC index / 键盘交互 |
| **Narrative arc**（Hook → Context → Core → Shift → Takeaway） | 多页演示密度 |
| **Class-first discipline**（无 inline 样式 except 视口单位） | 图片网格密度（CV 不需要 6-9 张图） |
| **References 矩阵**（themes/layouts/styles/components/checklist 5 文件） | CJK 演示字体配色系统（CV 用更克制的色板） |

最值得借鉴的是 **架构纪律**（class-first + 5 文件 references 矩阵 + theme 锁定），不是视觉元素。

## Topic Axes

5 个正交轴，覆盖 focus 4 条：

1. **CV 视觉与版式** — templates、theme system、layout 库
2. **CJK 渲染与 ATS 鲁棒性** — 字体本地化、ATS selftest 增强、中国市场约定
3. **PDF inbound 提取** — JD/offer/recruiter PDF → manual_signal_import 入栈
4. **桌面化 / 易用性** — desktop wrapping、distribution、非 CLI 用户接入
5. **agent-side 接通** — modes/zh-cn/pdf.md、AGENTS 路由、决策点文档化

## Ranked Ideas

### 1. guizang-style CV 设计系统（class-first + theme 锁定 + layout 库）

**Axis:** CV 视觉与版式
**Description:** 把 guizang 的"5 文件 references 矩阵 + class-first + theme 锁定"架构搬进 CV templates。
- 新建 `templates/cv-system/` 目录：`themes.md`（4-5 锁定调色板）、`layouts.md`（CV 头部 / 单 / 双 / 三 column 选项 + ATS 等级标签）、`components.md`（role-card / metric-block / skill-grid spec）、`checklist.md`（CJK / ATS / 字号 / 行高 / 边距 P0-P3）
- `templates/cv-template.html` 重构为 class-first：所有样式收进 `cv-system.css`
- LLM agent 在 modes/pdf.md 走"先选 theme → 再选 layout → 注内容 → checklist 自检"流水线
- CN 版同步重构 `cv-template.cn.html` 走同一架构
**Basis:** `direct:` guizang `references/` 架构验证过；`direct:` 当前 cv-template.html 387 行混样式与内容；`reasoned:` 类纪律降低 theme 切换 / 多 layout 维护成本
**Rationale:** 当前加 theme = 全文搜索替换；借纪律后加 theme = 改 6 个 CSS 变量。真正的 compounding。
**Confidence:** 90% / **Complexity:** Medium
**Status:** Recommended Phase 2

### 2. ATS selftest 自动嵌入 PDF 生成 + 负向 fixture 库

**Axis:** CJK 渲染与 ATS 鲁棒性
**Description:**
- 把 `cv-ats-selftest.mjs` 调用嵌入 `generate-pdf.mjs` 末尾，作为 mandatory step
- 新建 `tests/fixtures/canary-cv.cn-broken-*.html` 5-10 份故意坏的 CV：sidebar 拆分、CJK 字体路径错、嵌入 SVG 图片代字、双栏 layout、错乱 reading order
- `tests/cv-ats-selftest.mjs` 加 `--expect-fail` 模式
**Basis:** `direct:` 当前 selftest 是"人工记得运行"；`direct:` PR-A 同义反复 bug 暴露 selftest 自身可能漏；`external:` PR-C must-NOT-match fixtures 已验证此架构
**Rationale:** ATS selftest 是 zh-cn CV branch 的最后防线。让它**总是跑**且**对已知坏 CV 一定拒**，从"理论上有"变成"机械地保护"。
**Confidence:** 90% / **Complexity:** Low
**Status:** Recommended Phase 1

### 3. PDF inbound 提取管道（offer/JD PDF → manual_signal_import）

**Axis:** PDF inbound
**Description:**
- 新增 `bridges/pdf-extract.mjs`：用 `pdf-parse` 或 `pdfjs-dist` 提取文本（v1 不做 OCR）
- 复用 `manual_signal_import` provider：用户把 offer.pdf / jd.pdf 丢进 `data/inbox/`，`scan.mjs` 遍历该目录 → 抽文本 → 写 `data/signals.ndjson` → 走现有 pipeline
- 新增 `modes/pdf-import.md`：agent 流程，提取后 decide "offer letter" vs "JD" vs "recruiter outreach"
- 中文 offer 特化：识别"基本工资 / 13薪 / 14薪 / 公积金 / 期权"结构化字段
**Basis:** `direct:` `manual_signal_import` 已接通 ndjson 写入；`direct:` ce-code-review brief 指出"China-specific gap: 中文 offer letter 通常是 PDF"；`external:` `pdf-parse` 是无 native deps 的稳定库
**Rationale:** 把 yoCareer 从"每个 JD 必须有 URL"扩展到"任何 PDF 都能入栈"。**这是上轮被 kill 的 idea #4（私域信号管道）的正交替代**——不做 capture habit 改变，只接通已有 PDF 输入习惯。
**Confidence:** 85% / **Complexity:** Medium
**Status:** Recommended Phase 3

### 4. CN _shared.md 深度补齐 + 本地 CJK 字体 subset 兜底

**Axis:** CJK 渲染与 ATS 鲁棒性
**Description:**
- `modes/zh-cn/_shared.md` 从 31 行扩到 ~13KB（与 EN parity）：补国内市场约定（13/14/15薪、五险一金、试用期、年终奖、大小周、外包驻场、HR 称谓 / 内推话术、脉脉 / BOSS 直聘 / 拉勾的平台调性差异、AI/技术 vs 互联网 vs 传统行业薪资区间口径）
- `fonts/` 目录加 **Noto Sans SC subset**（常用 3000 字 + 拉丁/数字/标点，woff2 子集 ≈ 800KB）作为 GFW / 离线兜底
- `cv-template.cn.html` 用 `@font-face local("Noto Sans SC"), url("fonts/...") format("woff2"), url("https://fonts.googleapis.com/...") format("woff2")` 三级回退
**Basis:** `direct:` _shared.md 31 行欠深度；`direct:` GFW / 离线场景下 Google Fonts CDN 不可达；`reasoned:` 字体 fallback 链是行业标准
**Rationale:** zh-cn 当前是"在网时正常，离线时不可知"。补齐 + subset 让 CN 用户在任何网络环境下产出一致 CV。`_shared.md` 深度直接决定 LLM 评估的中国市场定性能力。
**Confidence:** 95% / **Complexity:** Low-Medium
**Status:** Recommended Phase 1

### 5. modes/zh-cn/pdf.md（agent-side 接通）

**Axis:** agent-side 接通
**Description:**
- 新建 `modes/zh-cn/pdf.md`，与 `modes/pdf.md` 同结构但中文 + zh-cn 默认值：cv-template.cn.tex/html 默认、ATS selftest `--lang=zh-cn` mandatory、字体回退链、中国市场关键词举例
- `.agents/skills/yoCareer/SKILL.md` Language Modes 段加 `pdf.md` 引用
- AGENTS.md zh-cn 段加 PDF 生成的语言识别规则：检测 CJK 时**强制**走 `modes/zh-cn/pdf.md`
**Basis:** `direct:` 当前 modes/zh-cn/ 没有 pdf.md，agent 渲染 CN CV 时跨进 Spanish modes/pdf.md；`direct:` PR-B 在 modes/pdf.md 加了 zh-cn template 选择规则，但写在 ES 文件里对中文 agent 不友好
**Rationale:** PR-B 没收完的尾巴。低成本、agent 体验提升明显。
**Confidence:** 90% / **Complexity:** Low
**Status:** Recommended Phase 1

### 6. YAML resume + theme skin 完全分离（数据契约重构）

**Axis:** CV 视觉与版式
**Description:**
- 把 `cv.md` 拆成 `cv.yml`（结构化数据）+ skin（templates 系统，独立选）
- `generate-pdf.mjs` 输入变成 `cv.yml + theme + layout` → 注入 class-first HTML
- 与 idea #1 强 compounding，但**触动数据契约**：cv.md 是用户层文件
**Basis:** `reasoned:` 当前 cv.md 是 markdown free-form，LLM 重写易丢结构；`reasoned:` YAML + skin 是 résumé-toolkit 成熟范式；`direct:` AGENTS.md 数据契约把 cv.md 列为用户层
**Rationale:** Architectural-tier 赌注，回报大但风险高。让 idea #1 的 theme 库真正发挥威力，但触动数据契约一旦做不好就是"ideation #4 式"翻车。
**Confidence:** 60% / **Complexity:** High
**Status:** Deferred — 待 #1 落地后判断 ROI

### 7. localhost web UI 替代 Go TUI（"desktop app" 的轻量化解释）

**Axis:** 桌面化 / 易用性
**Description:**
- 新增 `web-ui/`：Vite + lightweight 框架，serve `dashboard/` 同份数据但走浏览器
- `npm run ui` 启 localhost:5173，列 applications.md / reports / pipeline、点击查看 markdown、CV PDF preview
- 不替代 Go TUI；不打 Electron / Tauri 包
**Basis:** `direct:` Go TUI 对非终端用户不可达；`reasoned:` localhost web 是 dev-tool 行业最低摩擦的"GUI"；`external:` desktop-app agent 给的"highest UX fidelity"选项
**Rationale:** 给非 CLI 用户无门槛入口，但不偏离 agent-native（agent 仍是主交互；web UI 只读 + 触发器）。
**Confidence:** 70% / **Complexity:** Medium-High
**Status:** Contested
**反对意见（须保留）:** desktop-app agent 强烈反对："yoCareer 是 agent-native，agent IS the UI；wrapping 它不解决真问题"。如果用户接受这个观点，#7 与 ideation #4 同型 kill。

## Rejection Summary

| # | Idea | Reason |
|---|---|---|
| 1 | _shared.md / pdf.md / package.json bin 等单行修补 | 战术，不需要 ideation；直接 PR |
| 2 | Pandoc 替换 pdftotext | 依赖切换，无新工作流增益 |
| 3 | PDF.js + headless Playwright + OCR | 重栈，第一版用不到 OCR |
| 4 | 多列 CV 模板（FT/NYT 排版） | 反 ATS 已知坏实践；与 PR-A reading-order 检查冲突 |
| 5 | clipboard listener 桌面 app | 偏离 agent-native；增加"魔法"不增加可控性 |
| 6 | 强制 PDF（每个 JD 都先 PDF 化） | 过度限制；很多 JD 是 HTML |
| 7 | zh-cn 设为默认、en 作为可选 | 子主题替换；改变了产品身份 |
| 8 | Carbonyl（终端浏览器） | 受众太窄 |
| 9 | Tauri / Electron 桌面包装 | 500MB+ 体积；与 agent-native 哲学冲突；维护负担 |
| 10 | "career one-pager" 海报 | 产品边界外（学术海报方向） |
| 11 | 把 zh-cn 当"市场画像"重构整个 modes/ | AGENTS.md 已这么做；meeting-test fail |
| 12 | 装在 Claude Code 内的"安装向导"模式 | 与 #7 重叠且更间接 |
| 13 | guizang 的 WebGL / 多主题动画 | PDF 无法捕获；视觉与 ATS 冲突 |

## 与上一轮的关系（docs/ideation/2026-05-08-yocareer-cn-optimization.md）

| 上轮 idea | 本轮关系 |
|---|---|
| #1 zh-cn 完整化 | 已合（PR #20+#24）。本轮 #5 是它的尾巴 |
| #2 CJK CV + ATS selftest | 已合（PR #20）。本轮 #2 是把它的 selftest 升级为强制 + 加负向 fixtures |
| #3 risk-tiers + Block G | 已合（PR #20+#26） |
| #4 私域信号管道 | Killed（行为改变问题）。**本轮 #3 是正交替代**——不改 capture 习惯，接通已有 PDF 习惯 |
| #5 零 LLM 初筛 + dashboard | 仍 Unexplored。本轮 #7 与之相关但更轻量 |
| #6 贝叶斯反馈环 | 仍 Unexplored |
| #7 proof library + 动态 CV 组装 | 本轮 #6（cv.yml 重构）是它的执行形式 |

新出现的轴：**guizang-style CV 设计系统纪律**（#1）—— 上轮 ideation 没覆盖，但 leverage 高。

## Recommended First Wave

按 confidence × leverage × dependency 排：

**Phase 1（高确定性 + 互锁，可一个 PR 群做完）：**
- **#5 modes/zh-cn/pdf.md** (Conf 90% / Low)
- **#4 _shared.md 深度 + CJK 字体 subset** (Conf 95% / Low-Med)
- **#2 ATS selftest auto-嵌入 + 负向 fixture 库** (Conf 90% / Low)

三件互不冲突且都跟 zh-cn 用户体感修补对齐，PR-1 一次合（约 4-5h）。

**Phase 2（中等复杂度，独立 PR）：**
- **#1 guizang-style CV 设计系统**（Conf 90% / Medium）— 1-2 天

**Phase 3（greenfield 模块，独立 PR）：**
- **#3 PDF inbound 管道**（Conf 85% / Medium）— 1-2 天

**Phase 4（先观察）：**
- **#7 localhost web UI**（Conf 70% / Med-High）— 待 #1 theme 系统落地后判断
- **#6 cv.md → cv.yml 重构**（Conf 60% / High）— 待 #1 验证 theme 切换 ROI 后判断

## Open Questions

1. **#7 localhost web UI 是否做？** desktop-app agent 强烈反对，与 ideation #4 是同型 kill。需要用户判断。
2. **#3 PDF 提取**：第一版要不要支持 OCR（扫描 offer 不少）？建议第一版纯文本提取，OCR 作为 v2。
3. **第一波 PR 群（#2/#4/#5）打包成一个 PR 还是 3 个？** 用户选择 1 个（强相关、都偏 zh-cn polish）。

## Sources & References

- **Predecessor ideation:** [docs/ideation/2026-05-08-yocareer-cn-optimization.md](2026-05-08-yocareer-cn-optimization.md)
- **guizang-ppt skill:** `~/.claude/skills.disabled/guizang-ppt/` (本机)
- **Recent context:** PRs #23 PR-A / #24 PR-B / #25 PR-D / #26 PR-C（全部已合入 main）
- **Critical files & patterns to reuse:** `templates/risk-tiers.yml` + `tests/risk-tiers-selftest.mjs` MUST_NOT_MATCH（PR-C 范式）；`bridges/reach-read-url.mjs`（PDF bridge 模板）；`scan.mjs:737-757` `manual_signal_import` 入栈点
