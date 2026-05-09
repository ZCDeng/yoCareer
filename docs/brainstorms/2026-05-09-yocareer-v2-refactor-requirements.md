---
date: 2026-05-09
topic: yocareer-v2-refactor
---

# yoCareer v2 重构需求文档：Web app + CLI 混合架构

## Summary

将 yoCareer 从 CLI-first 工具重构为 Web app + CLI 混合架构。6 个 P0 功能（统一数据层 / 流程编排 / 浏览器扩展 / 双客户端架构 / 国内市场边界硬化 / Mirofish 风格设计契约）一次性 ship 为 v1。视觉沿用 mirofish-demo.pages.dev 的 dark-first 大编号步骤呈现风格（步骤数按实际功能模块划分，不强制 5 阶段）。老用户的 markdown / yaml / tsv 数据采用 fresh start，不迁移。

---

## Problem Frame

yoCareer v1.6.0 是一套面向中国求职者的本地 CLI 工具集，已建立 China-first provider 架构、CJK 友好的 CV 系统、以及 evaluation-first 的产品哲学。但用户实际试用后暴露三类痛点：

**门槛与流程错位。** 工具假设用户熟悉命令行，要懂 Node.js 和 Go；14 个 mode 入口 (`oferta / scan / apply / tracker / pdf / batch / interview-prep / ...`) 对 agent 友好但对人不友好——用户被迫做"我现在该用哪个 mode"的元决策。AGENTS.md 文档化的"五阶段流程"在 CLI 形态下没有任何视觉呈现。

**数据散乱与一致性运维。** 数据散落在 cv.md / config/profile.yml / modes/_profile.md / data/applications.md / reports/*.md / data/scan-history.tsv / batch/tracker-additions/*.tsv 等多处，靠 4 个守门脚本（`merge-tracker / dedup-tracker / normalize-statuses / verify-pipeline`）维护一致性。守门脚本的存在本身就是数据层失败的证据；多 tab 并发写、跨阶段 cache 失效等场景在文件型数据上无法支撑。

**国内市场覆盖不完整。** 国内 80% 求职 URL 在 BOSS / 拉勾 / 脉脉等登录墙内，复制到外部工具反人性；当前 manual_signal_import 走 PDF 拖拽 + ndjson 编辑，形态不符合用户实际行为；profile.example.yml 仍带 visa_status / currency:USD 等海外字段；modes/de/fr/ja/en 7 套语言模式与"只考虑国内用户"目标矛盾。

试用反馈达成共识：增量优化无法解决形态错位，必须彻底重构。

---

## Actors

- A1. **求职用户**: 中国国内求职者，使用浏览器登录招聘平台浏览岗位；可能同时使用 CLI（power user）或仅使用 Web（轻量用户）
- A2. **本地 daemon**: 在用户本机运行的 Node 服务进程，暴露 HTTP API + SSE，是数据写入唯一入口
- A3. **Web 客户端**: 浏览器内 SPA，主交互入口
- A4. **CLI 客户端**: 改造后的 .mjs 命令行工具，对 daemon API 的薄封装
- A5. **浏览器扩展**: 在招聘平台页面侧栏运行，捕获页面内容并发送给 daemon
- A6. **AI Agent (Claude Code / Codex 等)**: 通过 MCP / HTTP 接入 daemon API 的另一个客户端

---

## Key Flows

- F1. **用户数据采集与画像建立**
  - **Trigger:** 用户首次启动 v1
  - **Actors:** A1, A2, A3
  - **Steps:** 用户在 Web 上填写或粘贴 CV / 期望薪资 / 目标行业 / 地域偏好 → daemon 写入 SQLite → Web 显示画像摘要卡片
  - **Outcome:** SQLite 中存在该用户的 profile + cv 记录，后续模块可读
  - **Covered by:** R1, R2, R6

- F2. **从招聘平台保存岗位**
  - **Trigger:** 用户在 BOSS / 拉勾 / 智联 等平台浏览到感兴趣岗位
  - **Actors:** A1, A5, A2
  - **Steps:** 用户点击扩展侧栏"保存"按钮 → 扩展抓取当前页面公司 / 岗位 / JD / 薪资 / HR 信息 → 通过 localhost 与 daemon 通信 → daemon 写入 signals 表 → 扩展显示"已保存"反馈
  - **Outcome:** 该岗位作为一条 signal 进入 SQLite，可在 Web / CLI 中查询
  - **Covered by:** R9, R10, R12, R13

- F3. **岗位评估**
  - **Trigger:** 用户在 Web 上对某个 signal 触发"评估"，或 CLI 运行 `npx yocareer evaluate <signal-id>`
  - **Actors:** A1, A2, A3 (or A4)
  - **Steps:** 客户端调用 daemon `/api/evaluate` → daemon 调用 LLM 跑评分逻辑 → SSE 推送进度 → 评估完成写入 evaluations 表 → 客户端实时渲染评分卡
  - **Outcome:** 该 signal 关联一条评估记录（含 Block A-G + Legitimacy + 分数）
  - **Covered by:** R7, R14, R15, R18

- F4. **CV 改动触发下游 stale**
  - **Trigger:** 用户在 Web 上修改 CV 某段内容
  - **Actors:** A1, A2, A3
  - **Steps:** Web 提交修改 → daemon 写入 cv 新版本（追加而非覆盖） → 状态机识别下游依赖（评估 / 报告） → 标记为 stale → Web UI 显示"需要重跑"提示
  - **Outcome:** 用户清楚哪些已有评估因 CV 变更需要重新生成
  - **Covered by:** R3, R7, R8

- F5. **AI 表单填写 HITL**
  - **Trigger:** 用户在围墙平台的申请表单页点击扩展"AI 填表"
  - **Actors:** A1, A5, A2
  - **Steps:** 扩展从 daemon 拉取当前 cv + profile → 智能匹配表单字段 → 自动填入 → 提交按钮保持禁用 → 用户审核后手动启用并提交
  - **Outcome:** 表单字段被填写但**永远不自动提交**，用户保持最终决策权
  - **Covered by:** R10, R11

---

## Requirements

**统一数据层**
- R1. 使用 SQLite 单文件 + WAL 作为唯一的数据存储；所有用户数据（profile / cv / portals / signals / evaluations / reports）均落入 SQLite
- R2. 提供一份 JSON Schema 描述所有数据模型；前端表单生成、SQLite migrations、API 校验、CLI 输入输出均从此 schema 派生
- R3. 每条记录带 `created_at / as_of / event_log` 时间字段；状态变更追加而非覆盖，支持回放历史快照
- R4. Reports 不存为独立 markdown 文件，作为查询投影动态渲染；用户主动点击导出 PDF 时才落盘到 `reports/exports/`
- R5. 老 markdown / yaml / tsv 数据保留在 git 历史中只读，不进 SQLite，不提供迁移工具

**流程编排**
- R6. 用户可见流程按实际功能模块边界划分；五阶段（用户数据采集 → 招聘平台和数据源配置 → 职位查询 → 分析 → 报告）为描述性参考，不强制 5 段，实际步骤数 N 由模块边界决定
- R7. 后端每个 application / signal / evaluation 跑在显式状态机上；状态变更触发下游依赖标记为 stale，下游重跑后清除 stale 标记
- R8. 现有 14 个 mode 降级为内部能力（capability），UI 上按功能模块组织呈现，不向用户暴露 mode 概念

**浏览器扩展**
- R9. 浏览器扩展首批支持 BOSS 直聘 / 拉勾 / 智联 / 内推链接 / 微信公众号文章 5 类页面
- R10. 扩展核心功能仅限：(a) 当前页面内容一键保存到本地 daemon；(b) AI 智能填写申请表单 (HITL)；(c) 招聘官公开活跃度信号抓取
- R11. 扩展永远不自动点击提交按钮；任何投递动作必须用户手动确认
- R12. 扩展自身零数据存储；所有数据落到本地 daemon SQLite
- R13. 扩展与 daemon 通过 native messaging 或 localhost HTTP（CORS 严格白名单）通信

**双客户端架构**
- R14. 后端本地 Node daemon 暴露 REST + SSE API；包含 yoCareer 全部领域操作（evaluate / scan / generate-cv / batch / followup / pdf-import / interview-prep / patterns 等）
- R15. CLI / Web / 浏览器扩展 / AI Agent 四类客户端地位对等，均通过 daemon API 操作数据；daemon 是唯一数据写入者
- R16. 现有 .mjs CLI 命令保持原始命令名（`yocareer scan / oferta / pdf / ...`），改造为对 daemon API 的薄封装
- R17. Web 主入口是 Cmd+K 命令面板 + 按功能模块组织的卡片视图，无传统侧边栏导航
- R18. SSE 推送长任务进度（扫描 / 批处理 / 多步评估）；客户端实时显示进度

**国内市场边界硬化**
- R19. 物理删除 modes/de/fr/ja/en 目录及相关代码；只保留 modes/zh-cn 并提升为 modes/
- R20. 物理删除 visa_status / currency:USD 字段及 13e mois / 13. Monatsgehalt / 賞与 / Tarifvertrag / Probezeit 等海外字段；profile schema 明确国内字段集
- R21. 提供 `portals/capabilities.yml` 描述每个国内平台能力（自动登录可否 / 公开页查询可否 / 抓详情可否 / 必须 HITL）
- R22. 三道边界（local data 默认 / HITL 强制 / 围墙平台不自动化）作为 capabilities.yml 的字段，前端按字段渲染按钮状态与风控提示
- R23. 扫描阶段同时抓取招聘官公开活跃度信号（脉脉 / 小红书 / 微博 ID 公开主页），无需登录；红色卡片标记"招聘官 30 天未活跃 / 公司近期裁员舆情"

**Mirofish 风格设计契约**
- R24. dark-first 配色：纯黑 / 暗灰背景 + 白灰文字 + 1-2 强调色（参考 mirofish-demo.pages.dev 的蓝 logo + 黄强调）
- R25. 字体栈：粗黑 sans-serif 大标题 + 装饰性手写 cursive 副标题（节制使用，仅用于人情味文案）+ 等宽字体（评分 / 薪资 / 日期 / 大编号）+ 普通 sans-serif body
- R26. 流程步骤呈现仿 mirofish-demo.pages.dev 的 "Predict in N Steps" 模式：大编号 + 标题 + 一句技术性副标题 + 暗灰圆角卡片；步骤数 N 适配实际功能模块数
- R27. 暗灰圆角卡片 + 充裕留白 + 细线分隔；禁止 hero banner / onboarding tour / 空状态插画 / 装饰性大图
- R28. 主页 hero 使用黑白线条人物插画作情感锚点（仿 mirofish-demo 的招牌人物插画带，但换成"求职者群像"），仅一处使用，不重复
- R29. 提供单一 design tokens 文件驱动 Web / PDF / CLI 输出统一；沿用项目已有的 guizang-style 4 文件矩阵（themes / layouts / components / checklist）

---

## Acceptance Examples

- AE1. **Covers R7, R8.** Given 用户在"个人资料"模块修改了 CV 中的"工作经历"段落, when 保存提交, then 该 CV 派生的所有评估记录被标记为 stale，UI 在评估列表上显示橙色"需要重跑"徽章。
- AE2. **Covers R10, R11.** Given 用户在 BOSS 直聘网页申请表单上点击扩展的"AI 填写"按钮, when 表单字段被自动填入完毕, then 表单"提交"按钮处于禁用灰色状态，需用户额外勾选"我已审核"才解锁。
- AE3. **Covers R23.** Given 扫描阶段访问到一个 BOSS 岗位详情页且页面包含 HR 个人公开链接, when 扫描器解析该页面, then 同时抓取 HR 在脉脉 / 微博的公开活跃度（最后回复时间 / 月响应数）作为该岗位的元数据存入 signals 表。
- AE4. **Covers R15, R16, R18.** Given 用户在终端运行 `npx yocareer scan` 同时在 Web UI 上查看扫描进度, when daemon 通过 SSE 推送扫描进度, then CLI 终端和 Web UI 同步显示相同的进度数字与日志。
- AE5. **Covers R3.** Given 用户的 CV "工作经历"段落经过 3 次修改, when 用户查询"3 个月前的某次评估", then 系统返回的报告引用当时的 CV 快照（不是当前最新版本），UI 标注 "as_of: 2026-02-09"。
- AE6. **Covers R12, R13.** Given 用户卸载浏览器扩展, when 重新安装, then 扩展启动后无任何本地缓存或历史数据，所有招聘信号仍可在 Web UI / CLI 中正常访问。

---

## Success Criteria

- 一个新用户能在 30 分钟内完成从安装到看到第一份评估报告的全流程（无需阅读 README）
- 老 CLI 用户能用 `npx yocareer <原命令>` 继续日常工作流，所有原有命令名兼容
- 同一个 SQLite 数据，在 Web / CLI / 浏览器扩展 / AI Agent 四个客户端上读到的内容一致
- 删除 modes/de/fr/ja/en 后整体代码量减少 ≥ 30%（衡量"国内边界硬化"是否落地）
- 浏览器扩展首批 5 类平台的"一键保存"成功率 ≥ 95%（自动测试覆盖）
- ce-plan 阶段不需要再倒推产品边界、流程模块划分、扩展支持的平台范围、设计风格细节

---

## Scope Boundaries

- Sentinel 自动投递 / 任何形式不审核就发的功能（违反 AGENTS.md 伦理）
- 多语言模式（modes/de/fr/ja/en 物理删除）
- 海外字段（visa_status / 13e mois / 13. Monatsgehalt / Tarifvertrag / Probezeit / 賞与 / overseas comp templates 等）
- 移动端优先形态（mobile-first / 原生 iOS/Android App）
- Electron / Tauri 桌面壳
- 围墙平台账号自动登录 / CAPTCHA 绕过 / 批量私信 / 自动投递机器人
- 全球市场扩展（产品聚焦中国国内求职）
- v1 数据迁移工具（fresh start 替代）
- 强制五阶段流程结构（按功能模块划分而非死抠 5 段）
- "先做小实验验证 refactor 是否过早"路径（用户决定直接全量重构）
- agent-native 哲学外的硬绑定（不强求 Claude Code / Codex 必须存在；agent 是可选客户端而非必需）
- 招聘官信号超出公开页面范围的抓取（不抓登录态、不爬私域消息）

---

## Key Decisions

- **Fresh start 数据策略**: 老 markdown 数据保留只读不迁移；避免遗留数据污染新 schema 设计，简化 v1 上线复杂度
- **流程不强制五阶段**: 用户原话"流程清晰化"中的五阶段是描述性参考，实际功能模块边界由产品设计决定，可能 4 / 5 / 6 个步骤
- **Mirofish 风格的具体来源**: https://mirofish-demo.pages.dev/ 是规范参考；视觉特征是 dark-first + 大编号步骤呈现 + 黑白人物插画 hero，不是早期推测的 "data-dense 卡片"
- **浏览器扩展是 v1 P0 必做**: 不放 v2；中国用户用自己账号登录招聘平台浏览的现实决定了扩展不可省
- **CLI 不死，与 Web 平等**: API daemon 是中心，CLI 改造为对 API 的薄封装；保留原命令名兼容老用户
- **v1 一次性 ship 全部 6 个 P0**: 不分阶段；用户判断分阶段 ship 会留下半成品状态，反而拖慢产品成熟
- **三道边界做成 schema 字段**: 不只在文档里强调，而是在 capabilities.yml 中作为可校验字段；前端按字段渲染禁用状态

---

## Dependencies / Assumptions

- daemon 运行在用户本地（127.0.0.1），不需要云端服务；隐私 / 合规风险最小化
- SQLite 作为数据层选型（不用 PostgreSQL / 任何远程数据库）
- 浏览器扩展首发支持 Chromium-based 浏览器（Chrome / Edge / 360 / Brave）；Firefox / Safari 待 v1.5
- 用户具备 Node.js 18+ 运行环境（与现有 yoCareer 一致）
- mirofish-demo.pages.dev 的设计风格作为视觉参考；不违反 yoCareer 三道边界（local data 默认 / HITL / 围墙平台不自动化）
- 招聘官公开信号抓取（脉脉 / 小红书 / 微博 ID 公开主页）的合规边界假设：只抓公开页面，不模拟登录、不绕过反爬、不批量请求；具体抓取强度阈值待 ce-plan 阶段与法务确认
- 现有 14 个 mode 的功能集合是 v1 的能力下界；不引入新 mode，不删除现有 mode 的能力（仅重组 UI 暴露形式）

---

## Outstanding Questions

### Resolve Before Planning

（无——所有产品决策已在本文档中明确收敛。）

### Deferred to Planning

- [Affects R14, R17][Technical] Web 框架选型：vanilla zero-build / Vite + 轻量框架 (Svelte / Solid) / Vite + 主流框架 (React / Vue)。建议 ce-plan 评估开发速度 vs 维护成本 trade-off，并参考现有 web-ui/ 的 vanilla 演进可能性
- [Affects R14][Technical] Daemon 启动方式：npm script / 系统服务 (launchd / systemd) / 安装包（含自启动）。建议 ce-plan 与 onboarding 体验权衡
- [Affects R12, R13][Technical] 扩展与 daemon 的通信协议：native messaging vs localhost HTTP CORS。建议 ce-plan 比较安全性与跨浏览器兼容性
- [Affects R9][Needs research] 扩展首批 5 类平台之外的 BOSS 私信 / 拉勾在线聊天 等场景是否纳入 v1。建议 ce-plan 评估抓取复杂度与合规风险
- [Affects R26, R28][Technical] 黑白人物插画 hero 的具体素材来源（开源 / 自绘 / AI 生成）。建议 ce-plan 评估版权合规与视觉一致性
- [Affects R3][Technical] event_log 字段的具体存储方式（同表 JSON 字段 vs 独立事件表）。建议 ce-plan 评估查询性能与回放成本
- [Affects R7][Technical] 状态机的具体 stage 命名与 transition 图。建议 ce-plan 根据 R6 的功能模块划分推导
- [Affects R23][Needs research] 招聘官公开信号抓取的具体技术方案（页面 scrape / 公开 API / OCR）和单平台请求频率上限。建议 ce-plan 与法务一起拍板
- [Affects R29][Technical] design tokens 的具体格式（JSON / TypeScript / CSS Custom Properties）和与 PDF 模板 / CLI 颜色输出的同步机制
- [Affects R19, R20][Technical] modes/de/fr/ja/en 删除时与 agentskills.io 多 CLI 兼容性约束的协调（即多 CLI 入口仍要保留，但语言子目录删除）
