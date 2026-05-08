---
date: 2026-05-08
topic: zh-cn-modes-parity
---

# Requirements: zh-cn 模式补齐与国内市场默认配置

## Summary

补齐 `modes/zh-cn/` 到与 `de/fr/ja` 同等的 5 文件 parity，在 AGENTS.md 文档化中文模式触发规则，并更新 `config/profile.example.yml` 为国内市场默认配置（国产 LLM、时区、archetypes、薪资格式）。

---

## Problem Frame

yoCareer v1.6.0 在 `package.json` 中已定位为 "China-market workflows"，但实际默认值仍以英语为中心。`modes/zh-cn/` 只有 3 个文件（`_shared.md`、`evaluate.md`、`signal-review.md`），而 `de/fr/ja` 各有 5 个。AGENTS.md 的 "Language Modes" 段显式记录了德/法/日的触发规则，但对中文模式完全沉默。`config/profile.example.yml` 的示例是旧金山候选人、美元薪资、OpenAI 语境——国内用户首次配置时感到明显的错位。

这导致国内用户 onboarding 时，agent 用英文模式跑评估，所有中文翻译资源被埋。用户在第一次会话就得出"这个工具不是为我做的"的结论。

---

## Requirements

**modes/zh-cn/ 文件补齐**

R1. 新增 `modes/zh-cn/apply.md`——中文求职申请表单辅助模式。翻译自 `modes/apply.md`，保留原有结构（字段识别、草稿生成、材料准备），但使用中文求职语境词汇（简历、求职信、工作经历、项目经验、技能、期望薪资、到岗时间）。

R2. 新增 `modes/zh-cn/pipeline.md`——中文 URL 收件箱/待处理管道模式。翻译自 `modes/pipeline.md`，保留原有结构（URL 分类、评估触发、批量处理），但使用中文语境表达。

R3. 新增 `modes/zh-cn/README.md`——中文模式使用文档。包含：何时使用中文模式（目标 JD 为中文、居住在中国、用户明确要求中文输出）、两种激活方式（每次会话显式指令 / `config/profile.yml` 持久配置）、已翻译文件清单、有意不翻译的术语清单（pipeline、tracker、score、archetype、proof point 等保持英文）、中文求职术语词汇表（内推、五险一金、试用期、年终奖、大小周、外包、驻场、脉脉、BOSS直聘 等）。

**AGENTS.md 文档化**

R4. 在 AGENTS.md "Language Modes" 段加入中文模式条目，格式与德/法/日一致。包含：模式定位（`modes/zh-cn/` — 中文翻译 + 中国市场特有词汇）、触发条件（用户说"用中文模式" / `language.modes_dir: modes/zh-cn` / agent 检测到中文 JD）、何时不使用（投递英文岗位时仍用默认英文模式）。

**国内市场默认配置**

R5. 更新 `config/profile.example.yml` 示例为国内市场语境：候选人信息示例改为中国姓名/+86 手机号/中国一线城市；`target_roles` 示例改为国内 AI 热门角色（大模型应用工程师、算法工程师、AI 产品经理）；`archetypes` 示例映射国内常见职级体系；`compensation` 示例使用 "25K-40K × 14薪" 格式而非美元年包；`location` 默认时区 `Asia/Shanghai`；新增可选的 `llm.provider` 配置段，列出国产 LLM 示例（DeepSeek、Kimi、Qwen、智谱、豆包）及其 base_url 模板。

**数据契约合规**

R6. 所有用户特定的 archetype、目标公司、个人叙事内容必须写入 `config/profile.yml` 或 `modes/_profile.md`（用户层），不得在 `modes/_shared.md` 或任何系统层文件中硬编码用户内容。系统层文件（AGENTS.md、mode 文件、脚本）只保留通用规则和结构。

---

## Success Criteria

- 国内新用户首次运行 `/yoCareer` 时，agent 能正确识别并切换到中文模式（通过系统语言检测、CV 语言、或用户显式请求）。
- `modes/zh-cn/` 文件数量与 `de/fr/ja` 一致（5 个）。
- AGENTS.md 中搜索 "Chinese" 或 "zh-cn" 能命中 Language Modes 段落。
- `config/profile.example.yml` 中的示例让国内用户感到"这是为我写的"而非"这是美国人的模板我改改用"。
- 后续 ideation 的 #2（CJK CV）、#3（risk-tiers）、#4（signals pipeline）有清晰的 mode 文件可写入（zh-cn 模式已就位）。

---

## Scope Boundaries

- 不翻译所有英文 root modes（`auto-pipeline`、`batch`、`contacto`、`deep`、`followup`、`interview-prep`、`latex`、`oferta`、`ofertas`、`patterns`、`pdf`、`project`、`scan`、`tracker`、`training`）——只补齐 de/fr/ja 已有的 4 个核心模式（_shared + evaluate + apply + pipeline）。完整 i18n 是后续工作。
- 不修改 `modes/_shared.md` 的内容——遵循 DATA_CONTRACT，用户定制通过 `_profile.md` 或 `config/profile.yml` 覆盖。
- 不创建新的 mode 类型（如 learn mode、conversation mode）。
- CJK 字体/渲染、risk-tiers/Block G、私域信号管道分别属于后续 ideation #2/#3/#4，不在本轮 scope。

---

## Key Decisions

- **evaluate.md 保留现有文件名**：agent 通过文件内容而非文件名识别 mode，改名带来的多 CLI 同步成本高于收益。
- **README.md 遵循 de/README.md 结构**：已被 de/fr/ja 验证有效的模式（何时使用、如何激活、词汇表、贡献指南），避免重新发明。
- **国产 LLM 默认选 DeepSeek**：性价比最高且国内最普及，但 `config/profile.example.yml` 中列出多个备选（Kimi/Qwen/智谱/豆包），由用户最终选择。
- **有意不翻译的术语清单**：Tech 标准词汇（pipeline、tracker、score、archetype、proof point、tool 名称、tracker status 值）保持英文，混合中英文是真实国内 engineering 团队的沟通习惯。

---

## Dependencies / Assumptions

- 假设 `de/README.md` 的结构和 de/fr/ja 的 4 文件组织方式是正确的 reference——若 de/fr/ja 后续演进，zh-cn 跟随更新。
- 假设国产 LLM provider（DeepSeek/Kimi/Qwen/智谱/豆包）在 2026 年仍保持 OpenAI-compatible API 格式——若格式变更，provider 配置模板需同步更新。
- 依赖：`modes/apply.md` 和 `modes/pipeline.md` 的英文原文作为翻译 source of truth。

---

## Outstanding Questions

### Deferred to Planning

- `[Needs research]` 国产 LLM 的 base_url 和模型 ID 是否稳定？建议在 planning 阶段核实各 provider 最新文档。
- `[Technical]` `config/profile.example.yml` 中的 `llm.provider` 段是否需要与现有 `.env` 加载逻辑对齐？ planning 阶段检查 `lib/` 或现有脚本如何读取配置。
