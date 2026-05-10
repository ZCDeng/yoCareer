---
title: 结构化 YAML 查表作为 LLM 评分的 tie-breaker
type: solution
module: evaluation
tags: [llm, scoring, yaml, structured-output, risk-tiers]
problem_type: LLM 评分不稳定、幻觉或遗漏关键风险信号
origin: PR #20/#26, templates/risk-tiers.yml, modes/zh-cn/evaluate.md
---

## 问题

纯 LLM 推理做 offer 评分时，容易：
1. 对同一 JD 多次运行给出差异较大的分数
2. 遗漏明显的 red flag（如"大小周"、"外包"、"驻场"）
3. 对中文语境特有的风险信号不敏感

## 决策

采用"先查表后 LLM"两阶段评分：结构化 YAML 信号库做初筛和扣分基线，LLM 负责补充语义理解（如"文化氛围"、"成长空间"）。

## 实现要点

信号库结构（`templates/risk-tiers.yml`）：

```yaml
signals:
  - id: 996_culture
    tier: critical
    patterns:
      - regex: "(?:大小周|单休|做六休一)"
        lookbehind_exclude: "反(?:对|抗)?996"
    # tier 进入扣分公式；早期 weight 字段已删除（PR #26），
    # 同 tier 内信号同等扣分，区分严重度靠升级 tier 而非加 weight
```

评分流程（`modes/zh-cn/evaluate.md`）：
1. **查表阶段**：扫描 JD 文本，命中信号即按 tier 扣分（critical/high/medium/low 对应固定分值）
2. **LLM 阶段**：查表未覆盖的维度（团队文化、技术栈匹配度、成长空间）由 LLM 补充评分
3. **结构化证据节**：强制要求每个扣分点提供原文引用和信号 ID，便于复核

防误匹配措施（PR #26）：
- `lookbehind_exclude`：排除反 996、法务语境、客户押金等 benign 场景
- `signal_count` 区分单点命中 vs 饱和信号（多个独立来源确认）

## 效果

- 相同 JD 多次评分方差显著降低
- red flag 召回率从"偶尔漏检"提升到"结构化的 100% 命中"
- LLM token 消耗减少（查表阶段零 LLM 调用）

## 相关文件

- `templates/risk-tiers.yml` — 信号库定义
- `modes/zh-cn/evaluate.md` — 评分流程文档
- `templates/risk-tiers.yml` — 17 条信号 + tier 定义