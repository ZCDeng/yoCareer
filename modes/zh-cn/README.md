# yoCareer — 中文模式（`modes/zh-cn/`）

本目录包含 yoCareer 的中文翻译模式，面向中国市场求职者及使用中文职位描述（JD）的用户。

## 何时使用这些模式？

满足以下任一条件时，使用 `modes/zh-cn/`：

- 你主要投递**中文 JD**（BOSS直聘、智联招聘、猎聘、前程无忧、拉勾、脉脉、企业官网中文版等）
- 你的**简历语言为中文**，或在中英文之间切换
- 你需要**自然的中文 Tech 表达**，而非机器翻译腔
- 你需要处理**中国市场特有的求职要素**：五险一金、试用期、年终奖、13/14/15薪、大小周、外包/驻场、内推、脉脉社交招聘等

如果你投递的岗位 JD 以英文为主，即使公司是中国企业，仍建议使用默认英文模式 `modes/`。英文模式能更好地处理英文 JD 的语义和表达习惯。

## 如何激活？

yoCareer 没有内置的"语言开关"代码标志。有两种方式：

### 方式一 — 按会话，通过显式指令

在会话开始时明确告诉 Claude：

> "请使用 `modes/zh-cn/` 下的中文模式。"

或

> "用中文评估和填写申请——使用 `modes/zh-cn/_shared.md` 和 `modes/zh-cn/evaluate.md`。"

Claude 会从这个目录读取文件，而非 `modes/`。

### 方式二 — 持久配置，通过 profile

在 `config/profile.yml` 中配置语言偏好：

```yaml
language:
  primary: zh-cn
  modes_dir: modes/zh-cn
```

首次会话时提醒 Claude 尊重此配置（"请查看 `profile.yml`，我已设置 `language.modes_dir`"）。之后 Claude 会自动使用中文模式。

> 提示：`language.modes_dir` 字段是本项目的约定，非硬编码模式。如维护者想调整结构，该字段可随时更名。

## 已翻译文件

本轮覆盖与德/法/日同等的核心模式（5 文件 parity）：

| 文件 | 翻译来源 | 用途 |
|------|----------|------|
| `_shared.md` | `modes/_shared.md`（英文） | 共享上下文、评分维度、核心原则、中国市场特有用语 |
| `evaluate.md` | `modes/oferta.md`（西班牙文） | 中文职位完整评估（A-F 区块） |
| `apply.md` | `modes/apply.md`（英文） | 求职申请表单实时辅助 |
| `pipeline.md` | `modes/pipeline.md`（西班牙文） | URL 收件箱 / 第二大脑批量处理 |

此外，以下文件为**中国市场特有**，不在德/法/日 parity 范围内：

| 文件 | 用途 |
|------|------|
| `signal-review.md` | 私域信号复核（微信群/朋友圈/公众号/脉脉/牛客等渠道的招聘信号质量评估） |

其余模式（`scan`、`batch`、`pdf`、`tracker`、`auto-pipeline`、`deep`、`contacto`、`ofertas`、`project`、`training`）有意不在本轮翻译。它们的内容主要由工具指令、路径和配置命令构成，保持语言无关性。如社区有需求，可在后续 PR 中补充。

## 有意不翻译的术语

以下术语保持英文，属于 Tech 行业标准词汇：

- `cv.md`、`pipeline`、`tracker`、`report`、`score`、`archetype`、`proof point`
- 工具名称（`Playwright`、`WebSearch`、`WebFetch`、`Read`、`Write`、`Edit`、`Bash`）
- tracker 状态值（`Evaluated`、`Applied`、`Interview`、`Offer`、`Rejected`、`Discarded`）
- 代码片段、路径、命令

中文模式采用真实的国内 Engineering 团队沟通习惯：中文流畅叙述，英文术语在习惯使用处保留。不强行将 "Pipeline" 译为"流水线"，不将 `cv.md` 称为"简历文件"。

## 中文求职术语词汇表

调整或扩展模式时，请遵循以下词汇表以保持语气一致：

| 英文 | 中文（本仓库用法） |
|------|-------------------|
| Job posting | 职位 / JD / 招聘启事 |
| Application | 申请 / 投递 |
| Cover letter | 求职信 / 自荐信 |
| Resume / CV | 简历 |
| Salary | 薪资 / 工资 |
| Compensation | 薪酬 / 总包 |
| Skills | 技能 |
| Interview | 面试 |
| Hiring manager | 用人经理 / Hiring Manager |
| Recruiter | HR / 招聘专员 |
| AI | AI / 人工智能 |
| Requirements | 要求 /  prerequisites |
| Career history | 工作经历 / 职业经历 |
| Probation | 试用期 |
| Vacation | 年假 / 带薪休假 |
| 13th/14th month salary | 13薪 / 14薪 / 年终奖 |
| Permanent employment | 正式员工 / 编制 |
| Freelance | 自由职业 / 外包 |
| Reference letter | 推荐信 / 背调 |
| 内推 | 内部推荐 |
| 五险一金 | 社保+公积金 |
| 大小周 | 单双休 / 大小周 |
| 外包 | 外包 / 派遣 |
| 驻场 | 驻场 /  onsite 派驻 |
| 脉脉 | 脉脉（职场社交平台） |
| BOSS直聘 | BOSS直聘 |
| 牛客 | 牛客网 |
| 已读不回 | 已读不回 |
| 面议 | 薪资面议 |

## 贡献

如需改进翻译或翻译更多模式：

1. 按 `CONTRIBUTING.md` 开 Issue 提出
2. 遵循上方词汇表，保持语气一致
3. 意译和地道表达优先——不做逐字硬译
4. 保留结构元素（Block A-F、表格、代码块、工具指令）完全不变
5. 在提 PR 前，用真实的中文 JD（如 BOSS直聘或智联招聘上的职位）测试效果
