---
title: zh-cn 模式补齐与国内市场默认配置
type: feat
status: completed
date: 2026-05-08
origin: docs/brainstorms/2026-05-08-zh-cn-modes-requirements.md
---

# Plan: zh-cn 模式补齐与国内市场默认配置

## Summary

补齐 `modes/zh-cn/` 到与 `de/fr/ja` 同等的 5 文件 parity（新增 apply.md、pipeline.md、README.md；现有 `_shared.md`、`evaluate.md` 和 `signal-review.md` 保持不变），在 AGENTS.md 文档化中文模式触发规则，并更新 `config/profile.example.yml` 为国内市场默认配置（国产 LLM、时区、archetypes、薪资格式）。

---

## Problem Frame

yoCareer v1.6.0 定位为 "China-market workflows"，但 `modes/zh-cn/` 缺少 `apply.md`、`pipeline.md` 和 `README.md` 才能达到与 `de/fr/ja` 同等的 5 文件 parity（de/fr/ja 各有 `_shared.md`、evaluate、apply、pipeline、README.md；zh-cn 现有 `_shared.md`、`evaluate.md`、`signal-review.md`）。AGENTS.md 不文档化 zh-cn，且 `config/profile.example.yml` 的示例是旧金山候选人、美元薪资、OpenAI 语境。国内用户首次配置时感到明显错位，导致 onboarding 流失。

---

## Requirements

- R1. 新增 `modes/zh-cn/apply.md`——中文求职申请表单辅助模式（翻译自 `modes/apply.md`）
- R2. 新增 `modes/zh-cn/pipeline.md`——中文 URL 收件箱/待处理管道模式（翻译自 `modes/pipeline.md`）
- R3. 新增 `modes/zh-cn/README.md`——中文模式使用文档（何时使用、如何激活、词汇表）
- R4. 在 AGENTS.md "Language Modes" 段加入中文模式条目
- R5. 更新 `config/profile.example.yml` 为国内市场语境（候选人示例、AI 角色 archetypes、month-K × N薪 格式、Asia/Shanghai 时区、国产 LLM provider 选项）
- R6. 用户特定内容写入用户层文件，系统层文件只保留通用规则

**Origin actors:** 国内求职者（使用中文 JD、国内招聘平台）
**Origin flows:** 中文 JD 评估流程、申请表单填写流程、pipeline 批量处理流程

---

## Scope Boundaries

- 不翻译所有英文/西班牙文 root modes——只补齐 de/fr/ja 已有的 5 个文件（_shared.md + evaluate + apply + pipeline + README.md）。`signal-review.md` 是中国市场特有 mode，不在 de/fr/ja 中，保留不变
- 不修改 `modes/_shared.md` 内容——用户定制通过 `_profile.md` 覆盖
- 不创建新的 mode 类型
- CJK 字体/渲染、risk-tiers/Block G、私域信号管道属于后续 ideation，不在本轮 scope
- 不修改 SKILL.md 路由——zh-cn 模式通过 `language.modes_dir` 配置访问，不走命令路由

---

## Context & Research

### Relevant Code and Patterns

- `modes/apply.md` — 英文申请表单辅助模式，结构：Requirements → Workflow (6 steps) → Scroll handling
- `modes/pipeline.md` — 西班牙文 URL 收件箱模式，结构：Workflow → 格式规范 → 智能检测 → 自动编号 → 同步检查
- `modes/zh-cn/evaluate.md` — 现有中文评估模式，风格：中文标题、表格评分、分步骤输出
- `modes/zh-cn/_shared.md` — 中文共享上下文，含中国市场评分维度、职位类型、核心原则
- `modes/de/README.md` — 德文模式文档参考结构：标题、何时使用、如何激活（两种方式）、已翻译文件清单、有意不翻译的术语、词汇表、贡献指南
- `test-all.mjs` — 现有测试不检查 `modes/zh-cn/` 子目录文件，新增文件不会破坏现有测试

### External References

- 国产 LLM provider 文档（DeepSeek、Kimi、Qwen、智谱、豆包）——用于 `config/profile.example.yml` 中的 base_url 和模型 ID 示例

---

## Key Technical Decisions

- **evaluate.md 保留现有文件名**：agent 通过文件内容识别 mode，改名带来的多 CLI 同步成本高于收益。
- **signal-review.md 保留不变**：该文件是中国市场特有的 signal review 模式，不在 de/fr/ja 的 parity set 中，无需翻译或重命名。
- **README.md 遵循 de/README.md 结构**：已被 de/fr/ja 验证有效的文档模式，避免重新发明。
- **apply.md 翻译自英文原文、pipeline.md 翻译自西班牙文原文**：虽然 pipeline.md 根文件是西班牙文，但中文翻译应基于其当前内容（功能描述是准确的），同时参考英文模式的结构清晰度。
- **profile.example.yml 使用注释标注 `llm.provider` 为可选配置**：不破坏现有无 LLM 配置的用户，但为需要的用户提供国产选项模板。
- **有意不翻译的术语保持英文**：pipeline、tracker、score、archetype、proof point、tool 名称、tracker status 值——混合中英文是真实国内 engineering 团队沟通习惯。

---

## Open Questions

### Resolved During Planning

- **国产 LLM base_url 和模型 ID 是否稳定？** → 使用注释标注示例值，明确提示用户核实最新文档。不硬编码可能变更的值。
- **`llm.provider` 是否需要与现有 `.env` 加载逻辑对齐？** → `config/profile.example.yml` 是示例文件，实际运行时由 agent 读取 `config/profile.yml`。`llm.provider` 段作为可选配置，agent 在读取 profile 时自然获取。无需修改现有加载逻辑。

### Deferred to Implementation

- 中文求职术语的精确对应（如 "cover letter" → "求职信" 还是 "自荐信"）——在翻译时根据语境选择最自然的表达，必要时参考招聘平台实际用语。

---

## Implementation Units

### U1. modes/zh-cn/apply.md — 中文申请表单辅助模式

**Goal:** 创建中文求职申请表单辅助模式，让 agent 在用户填写中文招聘平台申请表单时提供母语辅助。

**Requirements:** R1, R6

**Dependencies:** None

**Files:**
- Create: `modes/zh-cn/apply.md`

**Approach:**
- 翻译自 `modes/apply.md` 的 6 步工作流（Detect → Identify → Search → Load → Compare → Analyze → Generate → Present）
- 使用中文求职语境词汇：简历、求职信、工作经历、项目经验、技能、期望薪资、到岗时间、自我介绍
- 保留所有工具指令和代码块结构（agent 通过结构识别指令）
- 输出格式区块保留 Markdown 代码块结构，注释改为中文

**Patterns to follow:**
- `modes/apply.md` — 结构和工作流
- `modes/zh-cn/evaluate.md` — 中文语气和风格

**Test scenarios:**
- Test expectation: none — documentation file, behavioral verification through agent execution

**Verification:**
- 文件可读，结构完整（含 Workflow、Step 1-6、Scroll handling）
- 中文术语自然，无生硬直译

---

### U2. modes/zh-cn/pipeline.md — 中文 URL 收件箱模式

**Goal:** 创建中文 URL 收件箱/待处理管道模式，让 agent 在处理 pipeline 中的中文 JD 时使用母语语境。

**Requirements:** R2, R6

**Dependencies:** None

**Files:**
- Create: `modes/zh-cn/pipeline.md`

**Approach:**
- 翻译自 `modes/pipeline.md` 的工作流（读取 pipeline.md → 提取 JD → 执行 auto-pipeline → 移动已处理 → 汇总表格）
- 使用中文语境表达：待处理、已处理、提取、评估、报告、PDF、追踪表
- 保留所有格式示例（pipeline.md 的待处理/已处理区块示例）
- 保留 `local:` 前缀和特殊平台处理（LinkedIn、PDF）的说明

**Patterns to follow:**
- `modes/pipeline.md` — 结构和格式规范
- `modes/zh-cn/evaluate.md` — 中文语气和风格

**Test scenarios:**
- Test expectation: none — documentation file, behavioral verification through agent execution

**Verification:**
- 文件可读，结构完整（含 Workflow、格式规范、智能检测、自动编号、同步检查）
- 代码块和格式示例正确

---

### U3. modes/zh-cn/README.md — 中文模式使用文档

**Goal:** 创建中文模式使用文档，让用户和 agent 知道何时、如何激活中文模式，以及哪些内容已翻译。

**Requirements:** R3, R6

**Dependencies:** None（可与 U1/U2 并行起草，最终文件清单在合并前与实际文件核对）

**Files:**
- Create: `modes/zh-cn/README.md`

**Approach:**
- 遵循 `modes/de/README.md` 的已验证结构：
  1. 标题和简介
  2. 何时使用（中文 JD、居住在中国、用户明确要求中文输出）
  3. 如何激活（每次会话显式指令 / `config/profile.yml` 持久配置）
  4. 已翻译文件清单（表格：文件名、翻译来源、用途）
  5. 有意不翻译的术语清单（pipeline、tracker、score、archetype 等保持英文的原因）
  6. 中文求职术语词汇表（内推、五险一金、试用期、年终奖、大小周、外包、驻场、脉脉、BOSS直聘 等）
  7. 贡献指南（如何改进翻译、新增 mode）

**Patterns to follow:**
- `modes/de/README.md` — 文档结构和组织方式

**Test scenarios:**
- Test expectation: none — documentation file

**Verification:**
- 包含所有必要章节（何时使用、如何激活、已翻译清单、不翻译术语、词汇表）
- 已翻译文件清单与 `modes/zh-cn/` 实际文件一致

---

### U4. AGENTS.md — Language Modes 段加入中文模式

**Goal:** 在 AGENTS.md 的 "Language Modes" 段中加入中文模式条目，与德/法/日格式一致。

**Requirements:** R4, R6

**Dependencies:** None

**Files:**
- Modify: `AGENTS.md`

**Approach:**
- 在 Japanese 条目之后插入 Chinese 条目
- 格式与德/法/日完全一致：
  - 粗体标题：`Chinese (China market):`
  - 路径：`modes/zh-cn/`
  - 描述：中文翻译 + 中国市场特有词汇列表
  - Includes：`_shared.md`, `evaluate.md` (evaluation), `apply.md` (apply), `pipeline.md`
- 添加 "When to use Chinese modes" 小节（三种触发条件）
- 添加 "When NOT to:" 说明（投递英文岗位时仍用默认英文模式）
- 确保插入位置不会破坏后续 "Skill Modes" 表格的解析

**Patterns to follow:**
- AGENTS.md 现有德/法/日条目的格式和措辞

**Test scenarios:**
- Test expectation: none — documentation change

**Verification:**
- 运行 `grep -A 20 "Chinese (China market)" AGENTS.md` 确认条目存在且包含正确格式、路径和 includes 列表
- 格式与德/法/日条目一致（路径、触发条件、使用时机）
- `test-all.mjs` Section 9 通过（AGENTS.md 完整性检查不依赖 Language Modes 具体内容）

---

### U5. config/profile.example.yml — 国内市场默认配置

**Goal:** 更新 `config/profile.example.yml` 的示例为国内市场语境，让国内用户首次配置时感到"这是为我写的"。

**Requirements:** R5, R6

**Dependencies:** None

**Files:**
- Modify: `config/profile.example.yml`

**Approach:**
- **candidate 段**：示例改为中国姓名（如 "张伟"）、+86 手机号（如 "+86-138-0013-8000"）、中国一线城市（如 "上海, 中国"）
- **target_roles 段**：primary 示例改为国内 AI 热门角色（大模型应用工程师、算法工程师、AI 产品经理）
- **archetypes 段**：示例映射国内常见职级体系（P5/P6/P7 对应、初级/中级/高级/专家）
- **compensation 段**：
  - `target_range` 示例改为 `"25K-40K × 14薪"`
  - `currency` 改为 `"CNY"`
  - `minimum` 改为 `"20K"`
  - `location_flexibility` 改为国内常见表达（"接受远程，每月 1-2 天 onsite"）
- **location 段**：
  - `country` 改为 `"中国"`
  - `city` 改为 `"上海"`
  - `timezone` 改为 `"Asia/Shanghai"`
  - `visa_status` 改为 `"无需工作签证"`
- **新增可选 llm.provider 段**：
  ```yaml
  # llm:
  #   provider: deepseek  # 可选: deepseek, kimi, qwen, zhipu, doubao
  #   model: deepseek-chat
  #   base_url: https://api.deepseek.com/v1
  #   api_key: "your-api-key-here"  # 或从环境变量读取: process.env.DEEPSEEK_API_KEY
  ```
  每个 provider 给出注释标注的示例配置（base_url、model 名称）

**Patterns to follow:**
- 现有 `config/profile.example.yml` 的 YAML 结构和缩进风格
- 注释使用 `#` 与现有风格一致

**Test scenarios:**
- Happy path: 文件是有效 YAML（可用任意 YAML parser 验证）
- Edge case: 新增 llm.provider 段被注释包围，不破坏无 LLM 配置的用户

**Verification:**
- YAML 语法有效（可通过在线 YAML validator 或 `python -c "import yaml; yaml.safe_load(open('config/profile.example.yml'))"` 验证）
- 所有字段保持与现有结构一致（未删除任何现有字段，只修改示例值和新增可选段）
- 文件仍可通过 `test-all.mjs` 的 "Personal data leak check"（新示例值不含真实个人信息）

---

## System-Wide Impact

- **Unchanged invariants:** `test-all.mjs` 的 Mode File Integrity 检查只验证英文 root modes，不检查 `modes/zh-cn/` 子目录，因此新增 zh-cn 文件不会破坏现有测试。SKILL.md 路由表不修改，zh-cn 模式通过 `language.modes_dir` 配置访问。
- **Interaction graph:** AGENTS.md 更新后，agent 在 onboarding 时能正确识别和推荐中文模式。
- **API surface parity:** 无 API 变更。所有变更均为文档和配置示例。

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 翻译质量不一致（不同 mode 文件语气/术语不统一） | 参考 `modes/zh-cn/_shared.md` 和 `modes/zh-cn/evaluate.md` 的现有风格；README.md 中提供词汇表统一术语 |
| `config/profile.example.yml` 的 YAML 语法错误 | 修改后用 YAML parser 验证；保持与现有缩进风格一致 |
| AGENTS.md 修改破坏 `test-all.mjs` Section 9 | test-all.mjs 只检查 requiredSections 的存在（如 "Data Contract"、"First Run"），不检查 Language Modes 内容，风险低 |
| 国产 LLM provider 示例值未来变更 | 使用注释标注 "请核实最新文档"，不硬编码易变值 |

---

## Documentation / Operational Notes

- `modes/zh-cn/README.md` 本身即为中文模式的文档入口。
- AGENTS.md 更新后，所有兼容 CLI（Claude Code、Codex、Gemini CLI、OpenCode、Qwen Code、Copilot CLI）的 agent 都能通过阅读 AGENTS.md 发现中文模式。

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-08-zh-cn-modes-requirements.md](../brainstorms/2026-05-08-zh-cn-modes-requirements.md)
- Related code: `modes/apply.md`, `modes/pipeline.md`, `modes/de/README.md`, `modes/zh-cn/_shared.md`, `modes/zh-cn/evaluate.md`
- Related test: `test-all.mjs` (Section 8: Mode File Integrity, Section 9: AGENTS.md Integrity)
