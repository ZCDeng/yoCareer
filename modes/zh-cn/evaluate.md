# 模式：中文职位评估

当用户粘贴中文 JD、职位链接、截图 OCR 文本或招聘信息摘要时，按以下流程评估。

## 输入处理

按顺序执行，**第 5 步必须在第 6 步之前完成**——评分要消费查表输出，不允许并行或跳过：

1. 识别公司、职位、城市、薪资、来源平台、发布时间。
2. 如果来源是 BOSS直聘、智联招聘、猎聘、前程无忧、拉勾、脉脉，明确标注为"用户导入信息"，不要尝试自动化抓取或登录。
3. 读取 `cv.md`、`config/profile.yml`、`modes/_profile.md` 和 `modes/zh-cn/_shared.md`。
4. 如果 JD 信息不足，输出缺口清单，但不要编造。
5. **结构化风险查表**（**强制**，先于评分）：
   - 读取 `templates/risk-tiers.yml`
   - 对 JD 全文逐条 `patterns` 正则匹配
   - 记录每个命中：`{id, tier, category, matched_text, jd_position}`
   - 按 category 汇总 `{tier_max, signal_count}`
   - 输出"结构化证据"章节（见下文 §3）。**任何评估报告必须包含这一节**——
     即便完全未命中也要明示"未命中任何信号（查表已执行）"。缺失这节视为流程未走完。

## 输出结构

### 1. 结论

给出：值得投 / 谨慎投 / 不建议投。

### 2. 评分

评分采用"**先查表后 LLM**"的两阶段模式（顺序不可颠倒）：

**Stage A — 查表基线**（机械、可审计）

每个维度的扣分由该 category 命中的最高 tier 决定：

| 命中 tier | 维度扣分 |
| --- | --- |
| `critical` | -2 分 |
| `high` | -1.5 分 |
| `medium` | -1 分 |
| `low` | -0.5 分 |
| 未命中 | 0 |

**同 tier 内不叠加扣分**（5 个 high 仍只扣 1.5）。但 `signal_count` 必须出现在
结构化证据节里——多次命中是"风险密集度"而非"风险严重度"，由 LLM 在 Stage B
作为额外信号使用。

**Stage B — LLM 补充**（在查表基线之上）

LLM 在保留 Stage A 扣分的前提下做以下调整：

- **加扣**：查表未覆盖但 LLM 识别到的风险（例：JD 与岗位名称自相矛盾，
  公司估值与 HC 不符）——额外扣分上限 -1，需注明理由。
- **回加**：查表命中但上下文显示为**真实误匹配**（如"外包管理岗"中"外包"
  指代客户而非本岗位）——回加分上限 +1，需注明 reasoning。
  注意：`tests/risk-tiers-selftest.mjs` 的 must-not-match fixtures 已经覆盖了
  最常见的误匹配模式；如果 must-not-match 文本仍然命中，说明是 selftest 漏网，
  应该开 PR 收紧 patterns 而非每次评估都靠 LLM 回加。
- **饱和度警示**：当某 category 的 `signal_count` ≥ 3，在结论里明确点出
  "该 category 风险密集"，作为定性判断（不影响 Stage A 数值）。

| 维度 | 分数 | category 映射 | 备注 |
| --- | --- | --- | --- |
| 人岗匹配 | 1-5 | (无) | 纯 LLM 评估 |
| HC 真实性 | 1-5 | `legitimacy_risk` | Stage A 基线 + Stage B 调整 |
| 薪酬质量 | 1-5 | `compensation_risk` | Stage A 基线 + Stage B 调整 |
| 工作负荷 | 1-5 | `workload_risk` | Stage A 基线 + Stage B 调整 |
| 合同风险 | 1-5 | `contract_risk` | Stage A 基线 + Stage B 调整 |
| 成长性 | 1-5 | (无) | 纯 LLM 评估 |
| 平台风险 | 1-5 | `platform_risk` | Stage A 基线 + Stage B 调整 |

### 3. 结构化证据（强制节）

按下表呈现查表输出。即便完全未命中也要保留此表头并写"无命中"行：

| signal_id | tier | category | signal_count | matched_text |
| --- | --- | --- | --- | --- |
| (示例) workload-996 | high | workload_risk | 2 | "996 工作制 / 大小周" |

后接 LLM 证据：

- **LLM 证据**：直接来自 JD、CV、用户材料或公开信息的推理。
- **饱和度判断**：哪个 category 的 `signal_count` ≥ 3。
- **Stage B 调整记录**：每条加扣/回加 都列出 (维度, ±N, 理由)。
- **未知**：需要用户补充或人工核验的信息。

### 4. 简历定制建议

最多 5 条。每条包含：

- JD 关键词
- CV 中可对应的真实经历
- 建议改写方向
- 不应夸大的边界

### 5. 沟通草稿

根据场景生成：

- BOSS 打招呼：短、具体、不像群发。
- 脉脉私信：强调共同领域或业务问题，不直接求人。
- 微信内推：给内推人降低判断成本。
- 邮件：结构完整，附简历提醒。

### 6. 面试准备

- 3-5 个 STAR 故事。
- 5 个业务/技术追问。
- 5 个反问面试官的问题。

### 7. 下一步

只建议用户手动执行的动作，例如：

- 手动投递前先确认岗位是否仍开放。
- 修改简历第 N 段。
- 将某段打招呼文本复制到平台。
- 新增记录写入 `batch/tracker-additions/*.tsv`，再执行 `node merge-tracker.mjs` 合并到 `data/applications.md`。
