---
title: risk-tiers.yml + Block G 结构化查表
type: feat
status: completed
date: 2026-05-08
completed: 2026-05-08
origin: docs/brainstorms/2026-05-08-risk-tiers-blockg-lookup-requirements.md
---

# Plan: risk-tiers.yml + Block G 结构化查表

## Summary

新建 `templates/risk-tiers.yml` 定义中国市场招聘 red flag 信号库，将 `modes/zh-cn/evaluate.md` 中依赖 LLM 推理的风险评估维度降级为"结构化查表 + LLM 补充"的混合模式，提升评估一致性、降低 LLM 成本，并覆盖当前西方 ghost-job 框架未触及的国内特有 red flags。

---

## Problem Frame

yoCareer v1.6.0 的 Block G（Posting Legitimacy）在 `modes/oferta.md` 中面向国际市场设计，信号维度集中在 ghost job、reposting、hiring freeze 等西方求职市场常见问题。`modes/zh-cn/evaluate.md` 虽将风险拆解为"HC 真实性、合同风险、平台风险"等维度，但仍完全依赖 LLM 逐条推理判断，导致评估不一致、成本浪费、覆盖盲区和不可审计。（see origin: docs/brainstorms/2026-05-08-risk-tiers-blockg-lookup-requirements.md）

---

## Requirements

- R1. 新建 `templates/risk-tiers.yml`，YAML 格式，定义中国市场的风险层级和 red flag 信号
- R2. 风险层级（tiers）：`critical`（一票否决）、`high`（强烈 caution）、`medium`（需核实）、`low`（参考信息）
- R3. 每个信号包含：`id`（唯一标识）、`tier`（层级）、`patterns`（正则/关键词列表，JD 文本匹配）、`weight`（计分权重）、`description`（人类可读说明）
- R4. 信号分类维度：`contract_risk`、`compensation_risk`、`workload_risk`、`platform_risk`、`legitimacy_risk`
- R5. 修改 `modes/zh-cn/evaluate.md`：在"合同风险"、"平台风险"维度评估流程中，先执行 `risk-tiers.yml` 结构化查表，再让 LLM 补充模糊信号
- R6. 查表输出格式：列出命中的信号 ID、tier、匹配的文本片段，作为 LLM 评估的上下文输入
- R7. 评分维度调整："HC 真实性"和"合同风险"的评分不再完全依赖 LLM 推理，而是以查表命中数 + tier 权重作为基线，LLM 仅负责调整边界 case
- R8. 保留 LLM 补充能力：对于查表未命中但 LLM 识别到的风险，仍纳入评估
- R9. 新增 `tests/risk-tiers-selftest.mjs`：验证 `templates/risk-tiers.yml` YAML 语法正确、所有信号有必填字段、patterns 正则有效
- R10. `test-all.mjs` 新增 Section：risk-tiers.yml 格式完整性检查

**Origin actors:** 国内求职者（使用中文 JD、国内招聘平台）
**Origin flows:** 中文 JD 评估流程

---

## Scope Boundaries

- 不修改 `modes/oferta.md`（根模式面向国际市场，保持纯 LLM Block G 不变）
- 不删除 `modes/zh-cn/evaluate.md` 中的 LLM 评估能力（降级为"查表基线 + LLM 补充"，非完全替换）
- 不新增外部依赖（YAML 解析用已有的 `js-yaml`）
- 不修改 `cv.md`、`config/profile.yml`、`modes/_profile.md` 数据契约
- risk-tiers.yml 信号库为系统层文件，后续可独立更新而不影响用户数据

---

## Context & Research

### Relevant Code and Patterns

- `modes/zh-cn/evaluate.md` — 中文评估模式，7 维度评分表，纯 LLM 推理流程
- `modes/oferta.md` — 西班牙文 Block G（Posting Legitimacy），纯 LLM 推理
- `test-all.mjs` — 11 个 section，新增 section 不影响现有检查
- `package.json` — 已依赖 `js-yaml@^4.1.1`，无需新增依赖
- `templates/states.yml` — 现有 YAML 模板参考（tracker states 定义）

### External References

- js-yaml 文档 — 用于 YAML 解析和验证

---

## Key Technical Decisions

- **YAML 格式 + js-yaml 解析**：与项目现有 YAML 配置风格一致（`templates/states.yml`、`portals.yml`）。js-yaml 已存在于 dependencies 中，无需新增包。
- **正则 pattern 存储为字符串**：YAML 中存储 `/pattern/flags` 格式的字符串，运行时通过 `new RegExp()` 解析。避免 YAML 对特殊字符的转义问题。
- **查表步骤插入位置**：在 evaluate.md 的"输入处理"（Step 1-4）之后、"评分"（Step 2）之前。此时 JD 文本已提取完毕，是最佳的规则匹配时机。
- **混合评估输出格式**：查表结果以 Markdown 表格形式插入到评估报告中，作为 LLM 评估的上下文。LLM 在后续评分时能看到已命中的规则，避免重复推理。

---

## Open Questions

### Resolved During Planning

- **查表步骤在 evaluate.md 中的精确插入位置？** → 在"输入处理"之后、"评分"之前。此时 JD 文本已提取，是最佳匹配时机。
- **pattern 使用纯字符串匹配还是正则？** → 正则。存储为 `/pattern/flags` 字符串，运行时 `new RegExp()` 解析。支持大小写不敏感（`/i` flag）。
- **测试脚本使用哪个 YAML 解析库？** → `js-yaml`，已存在于 `package.json` dependencies 中。

### Deferred to Implementation

- **risk-tiers.yml 具体信号列表的完整性**：在实现时填充，首批不少于 15 条信号。后续可通过独立 PR 扩展。
- **evaluate.md 中 LLM 提示词的精确措辞**：在实现时根据查表输出格式调整，确保 LLM 理解"基线 + 补充"的混合模式。

---

## Output Structure

```
templates/
  risk-tiers.yml                   (NEW)
tests/
  risk-tiers-selftest.mjs          (NEW)
modes/zh-cn/evaluate.md            (MODIFY)
test-all.mjs                       (MODIFY)
```

---

## Implementation Units

### U1. risk-tiers.yml 风险信号库

**Goal:** 创建中国市场招聘 red flag 信号库，包含 15+ 条结构化信号。

**Requirements:** R1, R2, R3, R4

**Dependencies:** None

**Files:**
- Create: `templates/risk-tiers.yml`

**Approach:**
- YAML 格式，顶层 `version: 1`，`signals:` 数组
- 每个信号字段：`id`（kebab-case）、`tier`（critical/high/medium/low）、`category`（contract_risk/compensation_risk/workload_risk/platform_risk/legitimacy_risk）、`patterns`（正则字符串数组，格式 `/pattern/flags`）、`weight`（1-10 整数）、`description`（人类可读说明）
- 首批信号覆盖 5 个维度，每个维度 3-5 条，总计不少于 15 条
- 示例信号：
  - `contract-outsourcing`: tier=high, patterns=["/外包|派遣|供应商|第三方雇佣/i"], 外包/派遣/供应商
  - `compensation-vague`: tier=medium, patterns=["/薪资面议|薪酬面议|待遇面议/i"], 薪资面议
  - `workload-996`: tier=high, patterns=["/996|大小周|单休|做六休一/i"], 996/大小周
  - `platform-unofficial-hr`: tier=medium, patterns=["/个人招聘|非企业微信|私人账号/i"], 非官方 HR 渠道
  - `legitimacy-repost-frequent`: tier=medium, patterns=["/长期招聘|常年招聘|急聘|大量招聘/i"], 频繁重发

**Patterns to follow:**
- `templates/states.yml` — YAML 格式和注释风格

**Test scenarios:**
- Test expectation: none — config file, verified by selftest script (U3)

**Verification:**
- 文件为有效 YAML（可通过 js-yaml 解析）
- 包含不少于 15 条信号
- 所有信号包含必填字段（id, tier, category, patterns, weight, description）
- tier 值在允许枚举范围内
- weight 值为 1-10 的整数

---

### U2. 中文评估模式集成结构化查表

**Goal:** 修改 `modes/zh-cn/evaluate.md`，在评估流程中引入 risk-tiers.yml 结构化查表。

**Requirements:** R5, R6, R7, R8

**Dependencies:** U1

**Files:**
- Modify: `modes/zh-cn/evaluate.md`

**Approach:**
- 在"输入处理"步骤之后、"评分"之前，新增"结构化风险查表"步骤：
  1. 读取 `templates/risk-tiers.yml`
  2. 对 JD 文本逐条匹配 patterns
  3. 输出查表结果表格（命中信号 ID、tier、匹配文本片段）
- 修改"评分"步骤：明确说明评分基于"查表基线 + LLM 补充"
  - HC 真实性和合同风险以查表命中数 + tier 权重作为基线
  - LLM 负责调整边界 case 和识别查表未覆盖的复杂风险
- 修改"证据与不确定性"步骤：将查表结果作为结构化证据列出
- 保留所有现有输出格式（结论、评分表、证据、简历建议、沟通草稿、面试准备、下一步）

**Patterns to follow:**
- `modes/zh-cn/evaluate.md` — 现有中文语气和评估流程结构
- `modes/de/angebot.md` 或 `modes/fr/offre.md` — 参考其他语言模式如何扩展评估维度

**Test scenarios:**
- Test expectation: none — documentation file, behavioral verification through agent execution

**Verification:**
- 文件可读，结构完整
- 新增"结构化风险查表"步骤明确、可执行
- 评分逻辑描述清晰（查表基线 + LLM 补充）
- 保留所有原有评估维度和输出格式

---

### U3. risk-tiers 自测试脚本

**Goal:** 创建验证 risk-tiers.yml 格式和规则有效性的测试脚本。

**Requirements:** R9

**Dependencies:** U1

**Files:**
- Create: `tests/risk-tiers-selftest.mjs`

**Approach:**
- CLI 接口：`node tests/risk-tiers-selftest.mjs [path-to-risk-tiers.yml]`
- 默认读取 `templates/risk-tiers.yml`
- 验证项：
  1. YAML 语法有效（js-yaml parse 不抛异常）
  2. 顶层包含 `version` 和 `signals` 字段
  3. 每个信号包含必填字段：id, tier, category, patterns, weight, description
  4. `tier` 值在 `['critical', 'high', 'medium', 'low']` 范围内
  5. `category` 值在允许范围内
  6. `weight` 为 1-10 的整数
  7. `patterns` 为非空数组，每个 pattern 可解析为有效正则（`/pattern/flags` 格式）
  8. `id` 唯一（无重复）
- 输出 JSON 格式报告：
  ```json
  {
    "file": "templates/risk-tiers.yml",
    "passed": true,
    "signal_count": 15,
    "checks": {
      "yaml_valid": true,
      "required_fields": true,
      "tier_values": true,
      "category_values": true,
      "weight_range": true,
      "patterns_valid": true,
      "ids_unique": true
    },
    "errors": []
  }
  ```

**Patterns to follow:**
- `tests/cv-ats-selftest.mjs` — JSON 报告格式和 CLI 接口风格
- `test-all.mjs` — Node.js ESM 脚本模式

**Test scenarios:**
- Happy path: 有效的 risk-tiers.yml → `passed: true`, exit 0
- Error path: YAML 语法错误 → `passed: false`, exit 1
- Error path: 缺少必填字段 → `passed: false`, exit 1
- Error path: 无效 tier 值 → `passed: false`, exit 1
- Error path: 无效正则 pattern → `passed: false`, exit 1
- Error path: 重复 id → `passed: false`, exit 1
- Edge case: 命令行参数指定其他路径 → 验证指定文件

**Verification:**
- 脚本可独立运行：`node tests/risk-tiers-selftest.mjs`
- 对有效 risk-tiers.yml 返回 `passed: true`
- 对无效文件返回 `passed: false` 并指明具体错误

---

### U4. CI 集成

**Goal:** 将 risk-tiers.yml 验证集成到 `test-all.mjs`。

**Requirements:** R10

**Dependencies:** U1, U3

**Files:**
- Modify: `test-all.mjs`

**Approach:**
- 在 test-all.mjs 新增 Section 12：Risk Tiers Integrity
- 调用 `tests/risk-tiers-selftest.mjs` 验证 `templates/risk-tiers.yml`
- 如果验证通过 → pass
- 如果验证失败 → fail（因为 risk-tiers.yml 是系统文件，格式错误属于需要修复的问题）
- 不需要跳过逻辑（与 Section 11 不同，此验证不依赖外部工具）

**Patterns to follow:**
- `test-all.mjs` 现有 section 结构（Section 1-11）
- `test-all.mjs` 的 pass/fail/warn 输出风格

**Test scenarios:**
- Happy path: risk-tiers.yml 格式正确 → pass
- Error path: risk-tiers.yml 格式错误 → fail
- Edge case: risk-tiers.yml 不存在 → fail

**Verification:**
- `node test-all.mjs` 全量通过（新增 section 无失败）
- 故意破坏 risk-tiers.yml 格式后，test-all.mjs Section 12 正确失败

---

## System-Wide Impact

- **Unchanged invariants:**
  - `modes/oferta.md` 完全不变
  - `modes/zh-cn/evaluate.md` 的 LLM 评估能力保留（仅增加前置查表步骤）
  - `test-all.mjs` 的 Section 1-11 完全不变
- **Interaction graph:**
  - `modes/zh-cn/evaluate.md` 新增读取 `templates/risk-tiers.yml` 的步骤
  - agent 在中文 JD 评估时先执行查表，再将结果作为上下文传给 LLM
- **API surface parity:** 无 API 变更。所有变更均为模式文档和配置扩展。

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| risk-tiers.yml 信号库维护负担 | 明确为系统层文件，后续通过独立 PR 扩展；首批 15 条覆盖高频场景即可 |
| evaluate.md 修改导致 agent 评估行为变化 | 保留 LLM 补充能力，查表仅作为基线；混合模式确保向后兼容 |
| pattern 正则误匹配（false positive） | 通过自测试脚本验证正则有效性；实际使用中通过 LLM 补充过滤边界 case |
| 中英文 JD 混排时的 pattern 覆盖 | 首批 pattern 同时覆盖中文和常见英文表达（如"outsourcing"、"salary negotiable"） |

---

## Documentation / Operational Notes

- `templates/risk-tiers.yml` 创建后，需要在 `modes/zh-cn/README.md` 中提及（作为中文模式特有的评估工具）
- 用户如需自定义 red flags，可通过 `modes/_profile.md` 或 `config/profile.yml` 覆盖（但首批实现中暂不支持用户层覆盖，后续可扩展）

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-08-risk-tiers-blockg-lookup-requirements.md](../brainstorms/2026-05-08-risk-tiers-blockg-lookup-requirements.md)
- Related code: `modes/zh-cn/evaluate.md`, `modes/oferta.md`, `test-all.mjs`, `templates/states.yml`
- Related dependency: `js-yaml@^4.1.1`
