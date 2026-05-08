---
date: 2026-05-08
topic: risk-tiers-blockg-lookup
---

# Requirements: risk-tiers.yml + Block G 结构化查表

## Summary

新建 `templates/risk-tiers.yml` 定义中国市场招聘 red flag 信号库，将 `modes/zh-cn/evaluate.md` 中依赖 LLM 推理的风险评估维度（HC 真实性、合同风险、平台风险）降级为"结构化查表 + LLM 补充"的混合模式，提升评估一致性、降低 LLM 成本，并覆盖当前西方 ghost-job 框架未触及的国内特有 red flags。

---

## Problem Frame

yoCareer v1.6.0 的 Block G（Posting Legitimacy）在 `modes/oferta.md` 中面向国际市场设计，信号维度集中在 ghost job、reposting、hiring freeze 等西方求职市场常见问题。`modes/zh-cn/evaluate.md` 虽将风险拆解为"HC 真实性、合同风险、平台风险"等维度，但仍完全依赖 LLM 逐条推理判断，导致：

1. **评估不一致**：同一 JD 在不同会话中可能得到不同的风险评级，因为 LLM 的推理有随机性
2. **成本浪费**：大量 obvious red flags（如"薪资面议、外包派遣、996 大小周"）本可通过规则命中，却消耗 LLM token
3. **覆盖盲区**：国内特有风险（BOSS 非企微 HR、闲鱼 commoditized 内推码、试用期过长、五险一金缺失）未被西方框架覆盖，LLM 也缺乏足够先验知识稳定识别
4. **不可审计**：评估结果无法追溯至具体规则命中，用户无法理解决策依据

---

## Requirements

**risk-tiers.yml 风险信号库**

- R1. 新建 `templates/risk-tiers.yml`，YAML 格式，定义中国市场的风险层级和 red flag 信号
- R2. 风险层级（tiers）：`critical`（一票否决）、`high`（强烈 caution）、`medium`（需核实）、`low`（参考信息）
- R3. 每个信号包含：`id`（唯一标识）、`tier`（层级）、`patterns`（正则/关键词列表，JD 文本匹配）、`weight`（计分权重）、`description`（人类可读说明）
- R4. 信号分类维度：
  - `contract_risk`：外包/派遣/供应商/试用期过长/五险一金缺失
  - `compensation_risk`：薪资面议/无薪资区间/13薪以下无说明
  - `workload_risk`：996/大小周/单休/高频率出差/强制 on-call
  - `platform_risk`：非企微 HR/批量内推码/非官方渠道/要求先付费
  - `legitimacy_risk`：JD 过于模糊/公司信息与工商不符/频繁重发/零公司信息

**中文评估模式结构化查表**

- R5. 修改 `modes/zh-cn/evaluate.md`：在"合同风险"、"平台风险"维度评估流程中，先执行 `risk-tiers.yml` 结构化查表，再让 LLM 补充模糊信号
- R6. 查表输出格式：列出命中的信号 ID、tier、匹配的文本片段，作为 LLM 评估的上下文输入
- R7. 评分维度调整："HC 真实性"和"合同风险"的评分不再完全依赖 LLM 推理，而是以查表命中数 + tier 权重作为基线，LLM 仅负责调整边界 case
- R8. 保留 LLM 补充能力：对于查表未命中但 LLM 识别到的风险（如"JD 描述与岗位名称明显不符"），仍纳入评估

**测试与 CI**

- R9. 新增 `tests/risk-tiers-selftest.mjs`：验证 `templates/risk-tiers.yml` YAML 语法正确、所有信号有必填字段、patterns 正则有效
- R10. `test-all.mjs` 新增 Section：risk-tiers.yml 格式完整性检查

---

## Success Criteria

- `templates/risk-tiers.yml` 包含不少于 15 条中国市场特有 red flag 信号
- 运行 `node tests/risk-tiers-selftest.mjs` 返回 `passed: true`
- `test-all.mjs` 全量通过，新增 section 无失败
- `modes/zh-cn/evaluate.md` 的评估流程明确引用 `risk-tiers.yml` 查表步骤
- 含有 obvious red flags（如"外包"、"薪资面议"）的 JD 在结构化查表阶段即被标记，不依赖 LLM 随机性

---

## Scope Boundaries

- 不修改 `modes/oferta.md`（根模式面向国际市场，保持纯 LLM Block G 不变）
- 不删除 `modes/zh-cn/evaluate.md` 中的 LLM 评估能力（降级为"查表基线 + LLM 补充"，非完全替换）
- 不新增外部依赖（YAML 解析用 Node.js 原生或已有依赖）
- 不修改 `cv.md`、 `config/profile.yml`、 `modes/_profile.md` 数据契约
- risk-tiers.yml 信号库为系统层文件，后续可独立更新而不影响用户数据

---

## Key Decisions

- **混合模式而非完全替换**：完全替换 LLM 会丢失对复杂、非结构化风险的识别能力（如"JD 描述与团队规模矛盾"）。结构化查表处理 obvious/高频信号，LLM 处理边界/模糊信号。
- **YAML 而非 JSON**：YAML 支持注释和多行字符串，更适合维护 red flag 说明文本；与项目现有 YAML 配置风格一致。
- **正则/关键词而非 NLP**：pattern 匹配使用简单正则和关键词，不引入 NLP 库。国内 red flags 的语言模式高度模式化（"外包"、"派遣"、"薪资面议"），正则足够覆盖。
- **风险层级 4 级**：`critical`（一票否决，如"要求先付费"）、`high`（强烈 caution，如"外包+无转正说明"）、`medium`（需核实，如"薪资面议"）、`low`（参考信息，如"未提及五险一金"）。

---

## Dependencies / Assumptions

- 假设 `modes/zh-cn/evaluate.md` 的现有评估流程可被扩展（在现有步骤之间插入查表步骤）
- 假设 agent 在评估时有能力读取 `templates/risk-tiers.yml`（通过 Read 工具）
- 假设 Node.js 环境已有 YAML 解析能力（项目已有 `js-yaml` 或可用 `yaml` 包，若未安装则作为 devDependency）

---

## Outstanding Questions

### Deferred to Planning

- [R5][Technical] 查表步骤在 evaluate.md 中的精确插入位置（在哪个 Block 之后、哪个 Block 之前）
- [R3][Technical] pattern 使用纯字符串匹配还是正则？是否支持大小写不敏感？
- [R9][Technical] 测试脚本使用哪个 YAML 解析库？
