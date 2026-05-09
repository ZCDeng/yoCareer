---
date: 2026-05-08
topic: yocareer-cn-optimization
focus: 1) 国内用户使用特点 2) 国内招聘平台和社媒数据质量 3) CV模板优化
mode: repo-grounded
---

# Ideation: yoCareer 国内优化

## Grounding Context

yoCareer is a local CLI job-search operations system for the China market (v1.6.0, Node.js ESM + Playwright + YAML). It already positions itself as "China-market workflows" but key gaps remain:

- **zh-cn 模式不完整**: `modes/zh-cn/` 只有 3 个文件（_shared.md, evaluate.md, signal-review.md），而 `modes/de/` 有 14+。AGENTS.md "Language Modes" 段显式记录了 de/fr/ja，但对 zh-cn 完全沉默。
- **CV 模板无 CJK 支持**: `cv-template.html` 仅声明 Latin-only Space Grotesk + DM Sans，`cv-template.tex` 无 xeCJK/ctex，国内 ATS（北森/MokaHR/智联/猎聘）对 CJK 渲染和提取顺序敏感。
- **私域信号管道缺失**: `manual_signal_import` provider 在 portals.yml 中存在但无 schema、无示例、无 helper 脚本。2025 年国内 70%+ 招聘信号在 公众号/微信群/朋友圈 流转。
- **BOSS Q3 2025 治理**: 20K+ 账号被封（80% AI 自动检测），平台风控已升级。`manual_only` 架构是正确的但报告中未把风险显式告诉用户。
- **内推码 commoditization**: 闲鱼 ¥10 批量贩卖，社区共识转向 "重要的是那个内推人"。
- **国产 LLM 崛起**: DeepSeek/Kimi/Qwen/豆包/智谱 已成为国内主力，但系统默认仍指向 OpenAI/Claude。

## Topic Axes

1. 本地化与上手体验
2. 私域信号入栈
3. 公开源数据质量
4. 简历与产物渲染
5. 信任与风险控制

## Ranked Ideas

### 1. zh-cn 完整化 + AGENTS.md 语言路由 + 国产 LLM 默认
**Axis:** 本地化与上手体验
**Description:** 补齐 `modes/zh-cn/` 到与 `de/fr/ja` 的 parity；在 AGENTS.md 文档化 zh-cn 触发规则；`config/profile.example.yml` 默认 `language.modes_dir: modes/zh-cn` + 国产 LLM 默认 provider + 时区 Asia/Shanghai。
**Basis:** `direct:` AGENTS.md 文档了 de/fr/ja 但未列 zh-cn；`modes/zh-cn/` 只有 3 个文件。
**Rationale:** 国内用户首次会话就在用错的模式跑评估，所有中文翻译资源被埋。
**Downsides:** 多 CLI (agentskills.io) 同步开销。
**Confidence:** 95%
**Complexity:** Low-Medium
**Status:** Explored (user selected for brainstorm)

### 2. CJK-first CV 渲染 + `pdftotext` ATS 自检
**Axis:** 简历与产物渲染
**Description:** `cv-template.cn.html`（思源黑体 + CJK unicode-range）+ `cv-template.cn.tex`（ctexart + xeCJK + xelatex 强制）+ `tests/cv-ats-selftest.mjs`（pdftotext reading-order 验证）。
**Basis:** `direct:` cv-template.html 无 CJK 声明；`external:` 四大国内 ATS 对 CJK 渲染敏感。
**Rationale:** 项目定位 "China-market"，但默认产物在国内 ATS 链路一开始就掉队。
**Downsides:** 字体文件分发、LaTeX 依赖双轨维护。
**Confidence:** 90%
**Complexity:** Medium
**Status:** Explored (user selected for brainstorm)

### 3. risk-tiers.yml + Block G 查表化
**Axis:** 信任与风险控制
**Description:** `templates/risk-tiers.yml` 定义国内 red flag（外包/模糊薪资/996/非企微HR/裸放内推码），Block G 从 LLM 推理降级为 structured lookup。
**Basis:** `external:` BOSS Q3 治理 + 内推码闲鱼 commoditization。
**Rationale:** 国内用户最关心的评估维度，当前西方 ghost-job 维度覆盖不足。
**Downsides:** 词表需定期维护。
**Confidence:** 90%
**Complexity:** Low
**Status:** Explored (user selected for brainstorm)

### 4. 私域信号入栈完整管道
**Axis:** 私域信号入栈
**Description:** `signals.ndjson` schema + example + `paste-jd.mjs` + `paste-screenshot.mjs` (OCR) + `data/signals/inbox/` drop folder + dedup_key。
**Basis:** `direct:` manual_signal_import 缺 schema 和工具；`external:` 2025 国内 70%+ 信号在私域流转。
**Rationale:** manual_signal_import 帐面上存在、使用上空跑。
**Downsides:** OCR 跨平台差异、截图隐私风险。
**Confidence:** 85%
**Complexity:** Medium
**Status:** Killed (2026-05-09): brainstorm 第一轮即收尾。理由：私域形态在微信群/朋友圈/公众号/小红书/脉脉之间差异极大，强行抽象会做出"哪个都不顺手"的工具；且用户自评"看到信号几乎不处理，过眼就忘"——意味着这是行为改变问题、非工具问题。MVP 不存在能让"过眼就忘"用户高频回访的合理形态。如未来 yoCareer 服务的用户群有明确"已经在每天截图整理招聘信号"的画像，可重启。

### 5. 零 LLM 初筛 + 每日 1 分钟仪表盘
**Axis:** 本地化与上手体验
**Description:** `quick-filter.mjs` 纯规则秒级初筛 + `dashboard/daily.html` 单页视图。
**Basis:** `reasoned:` 翻转 "LLM 是必要条件" 和 "终端重度用户" 假设。
**Rationale:** 降低使用门槛和 API 成本。
**Downsides:** 规则权重需调优。
**Confidence:** 75%
**Complexity:** Low
**Status:** Unexplored

### 6. 贝叶斯反馈环 + 黑匣子拒信复盘
**Axis:** 公开源数据质量
**Description:** `source-posterior.ndjson` 贝叶斯计数器 + `analyze-source-yield.mjs` + `rejection-blackbox/` 结构化复盘。
**Basis:** `reasoned:` feedback 环优于专家静态阈值。
**Rationale:** 没有 feedback 环的本地系统等于没用上"本地"的信息优势。
**Downsides:** 高复杂度、需持续标记 tracker 状态、冷启动数据不足。
**Confidence:** 70%
**Complexity:** High
**Status:** Unexplored

### 7. proof library + 动态 CV 组装
**Axis:** 简历与产物渲染
**Description:** `data/proofs/*.md` 按 JD 关键词 query 动态拼装 CV。
**Basis:** `reasoned:` 翻转 "模板=单一 cv-template" 假设。
**Rationale:** 让 CV 从"一份文档每次手改"变成"按 JD 投影的视图"。
**Downsides:** 最高复杂度、改 cv.md 数据契约、维护成本。
**Confidence:** 65%
**Complexity:** High
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason |
|---|------|--------|
| 1 | 国产 LLM defaults（单独） | absorbed into #1 |
| 2 | 期望薪资 month-K×N薪 | absorbed into #2 |
| 3 | DeepSeek + AI-Job-Notes scan | too narrow, overlaps with #4 |
| 4 | 删掉 per-offer CV tailoring | too radical for current state |
| 5 | community_post 默认丢弃 | overlaps with #3 |
| 6 | 招聘对话记忆体 | too architectural, overlaps with #6 |
| 7 | 中文默认（swap en↔zh-cn） | merged into #1, too disruptive |
| 8 | 合规品牌化为营销叙事 | not actionable product improvement |
| 9 | learn.mjs | overlaps with #6 |
| 10 | bridges/wechat_mp + nowcoder | covered by broader #4 |
| 11 | docs/solutions bootstrap | meta, not user-facing |
| 12 | integrity-checks.mjs | meta, not top-7 |
| 13 | 品酒笔记 / SOAP 病历 / 图书馆编目 | creative but niche/over-engineered |
| 14 | Release Train | conflicts with no-automation ethics |
| 15 | 球探报告 / CVE 档案 / 信号考古学 | overlaps with survivors or too narrow |
