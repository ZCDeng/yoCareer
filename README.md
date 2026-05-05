# yoCareer：AI 赋能求职系统 - 中文版

[English](https://github.com/ZCDeng/yoCareer/blob/main/README.md) | [Español](https://github.com/ZCDeng/yoCareer/blob/main/README.es.md) | [Português (Brasil)](https://github.com/ZCDeng/yoCareer/blob/main/README.pt-BR.md) | [한국어](https://github.com/ZCDeng/yoCareer/blob/main/README.ko-KR.md) | [日本語](https://github.com/ZCDeng/yoCareer/blob/main/README.ja.md) | [Русский](https://github.com/ZCDeng/yoCareer/blob/main/README.ru.md) | [简体中文](https://github.com/ZCDeng/yoCareer/blob/main/README.cn.md) | [繁體中文](https://github.com/ZCDeng/yoCareer/blob/main/README.zh-TW.md)

<u>很多人花几个月时间用笨办法找工作。所以我设计了一个希望能派上用场的系统。</u>\
公司用 AI 筛选候选人。我只是给候选人提供了 AI 来_选择_公司。\
<u>现在它开源了。</u>

---

**评估了 740+ 个职位 · 生成了 100+ 份个性化简历 · 拿到了 1 个梦想职位**

yoCareer 将任何 AI 编码命令行界面转变为完整的求职指挥中心。你不再需要在电子表格中手动跟踪申请，而是获得一个 AI 驱动的流程：

- **评估职位**，采用结构化的 A-F 评分系统（10 个加权维度）

- **生成定制 PDF** -- 针对每个职位描述定制的 ATS 优化简历

- **自动扫描招聘平台**（智联招聘、前程无忧、BOSS 直聘、拉勾网、猎聘网、脉脉、小红书、微信公众号、公司官网）

- **批量处理** -- 使用子代理并行评估 10+ 个职位

- **统一跟踪**所有内容，并进行完整性检查

> **重要提示：这不是一个海投工具。** yoCareer 是一个过滤器 -- 它帮助你从数百个职位中找到少数值得你花时间的机会。系统强烈建议不要申请评分低于 4.0/5 的任何职位。你的时间很宝贵，招聘人员的时间也是。提交前请务必审查。

yoCareer 是智能代理式的：Claude Code 使用 Playwright 导航招聘页面，通过推理你的简历与职位描述的匹配度来评估适配性（而非关键词匹配），并为每个职位定制你的简历。

> **注意：最初的评估不会很好。** 系统还不了解你。给它提供上下文 -- 你的简历、你的职业故事、你的证明材料、你的偏好、你擅长什么、你想避免什么。你培养它越多，它就越好。把它想象成培训一个新招聘人员：第一周他们需要了解你，然后他们就会变得非常有价值。

由一位使用它评估了 740+ 个职位、生成了 100+ 份定制简历并成功获得应用 AI 负责人职位的人打造。

## 核心功能

| 功能 | 描述 |
| --- | --- |
| **自动化流程** | 粘贴一个 URL，获得完整评估 + PDF + 跟踪记录 |
| **6 模块评估** | 职位摘要、简历匹配、级别策略、薪酬研究、个性化、面试准备（STAR+R） |
| **面试故事库** | 跨评估积累 STAR+反思故事 -- 5-10 个核心故事可以回答任何行为面试问题 |
| **谈判脚本** | 薪资谈判框架、地域折扣反驳、竞争 offer 杠杆 |
| **ATS PDF 生成** | 使用 Space Grotesk + DM Sans 设计的关键词注入简历 |
| **招聘平台扫描器** | 预配置 45+ 家公司（Anthropic、OpenAI、ElevenLabs、Retool、n8n……）+ 跨 Ashby、Greenhouse、Lever、Wellfound 的自定义查询 |
| **批量处理** | 使用 `claude -p` 工作进程并行评估 |
| **仪表盘 TUI** | 终端 UI 用于浏览、过滤和排序你的求职流程 |
| **人在回路中** | AI 评估和推荐，你决定和行动。系统永远不会提交申请 -- 你始终拥有最终决定权 |
| **流程完整性** | 自动合并、去重、状态规范化、健康检查 |

## 快速开始

```bash
# 1. 克隆并安装
git clone https://github.com/ZCDeng/yoCareer.git
cd yoCareer && npm install
npx playwright install chromium # PDF 生成所需

# 2. 检查设置
npm run doctor # 验证所有先决条件

# 3. 配置
cp config/profile.example.yml config/profile.yml  # 编辑你的详细信息
cp templates/portals.example.yml portals.yml # 自定义公司

# 4. 添加你的简历
# 在项目根目录创建 cv.md，用 markdown 格式填写你的简历

# 5. 使用 Claude 个性化
claude # 在此目录中打开 Claude Code

# 然后让 Claude 根据你的情况调整系统：
# "将原型改为后端工程职位"
# "将模式翻译成英文"
# "将这 5 家公司添加到 portals.yml"
# "用我粘贴的这份简历更新我的个人资料"

# 6. 开始使用
# 粘贴职位 URL 或运行 /yoCareer
```

> **系统设计为由 Claude 本身进行自定义。** 模式、原型、评分权重、谈判脚本 -- 只需让 Claude 更改它们。它读取它使用的相同文件，所以它确切知道要编辑什么。

详见 [docs/SETUP.md](https://github.com/ZCDeng/yoCareer/blob/main/docs/SETUP.md) 获取完整设置指南。

## Gemini CLI 支持

yoCareer 原生支持 [Gemini CLI](https://github.com/google-gemini/gemini-cli) -- 与支持 Claude Code 和 OpenCode 的方式相同。所有 15 个斜杠命令都可用，使用相同的 `modes/*.md` 评估逻辑。

```bash
# 1. 安装 Gemini CLI
npm install -g @google/gemini-cli
# 或者：npx @google/gemini-cli --version

# 2. 认证（免费 -- 使用你的 Google 账户）
gemini auth

# 3. 在 yoCareer 目录中运行
cd yoCareer
gemini

# 4. 像使用 Claude Code 一样使用斜杠命令
/yoCareer "Anthropic 的高级 AI 工程师..."
/yoCareer-evaluate --file ./jds/openai.txt
/yoCareer-scan
/yoCareer-pdf
/yoCareer-tracker
```

`GEMINI.md` 文件会自动加载为上下文。所有 15 个命令都在 `.gemini/commands/*.toml` 中定义。

### 使用 Gemini API（可选）

```bash
# 1. 在 https://aistudio.google.com/apikey 获取免费 API 密钥
cp .env.example .env
# 编辑 .env → 设置 GEMINI_API_KEY=你的密钥

# 2. 安装依赖
npm install

# 3. 评估职位描述
node gemini-eval.mjs "我们正在寻找一名高级 AI 工程师..."
node gemini-eval.mjs --file ./jds/my-job.txt
npm run gemini:eval -- "职位描述文本"
```

> **免费套餐：** 两种选项都无需付费。原生 CLI 使用 Google OAuth；API 脚本使用 `gemini-2.0-flash`（15 RPM，每天 100 万 token 免费）。

## 工作原理

yoCareer 是一个带有多种模式的单一斜杠命令：

```plaintext
/yoCareer → 显示所有可用命令
/yoCareer {粘贴职位描述} → 完整自动流程（评估 + PDF + 跟踪器）
/yoCareer scan → 扫描招聘平台寻找新职位
/yoCareer pdf → 生成 ATS 优化简历
/yoCareer batch → 批量评估多个职位
/yoCareer tracker → 查看申请状态
/yoCareer apply → 使用 AI 填写申请表
/yoCareer pipeline → 处理待处理的 URL
/yoCareer contacto → LinkedIn 外联消息
/yoCareer deep → 深度公司研究
/yoCareer training → 评估课程/证书
/yoCareer project → 评估作品集项目
```

或者直接粘贴职位 URL 或描述 -- yoCareer 会自动检测并运行完整流程。

### 评估流程

```plaintext
你粘贴职位 URL 或描述
        │
        ▼
┌──────────────────┐
│  原型检测        │  分类：LLMOps / 智能代理 / PM / SA / FDE / 转型
└────────┬─────────┘
         │
┌────────▼─────────┐
│  A-F 评估        │  匹配度、差距、薪酬研究、STAR 故事
│  (读取 cv.md)    │
└────────┬─────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
 报告   PDF  跟踪器
  .md  .pdf  .tsv
```

## 招聘平台扫描器

扫描器预配置了 **45+ 家公司**和跨主要招聘平台的 **19 个搜索查询**。复制 `templates/portals.example.yml` 到 `portals.yml` 并添加你自己的：

**AI 实验室：** Anthropic、OpenAI、Mistral、Cohere、LangChain、Pinecone \
**语音 AI：** ElevenLabs、PolyAI、Parloa、Hume AI、Deepgram、Vapi、Bland AI\
**AI 平台：** Retool、Airtable、Vercel、Temporal、Glean、Arize AI \
**联络中心：** Ada、LivePerson、Sierra、Decagon、Talkdesk、Genesys \
**企业级：** Salesforce、Twilio、Gong、Dialpad\
**LLMOps:** Langfuse、Weights & Biases、Lindy、Cognigy、Speechmatics \
**自动化：** n8n、Zapier、[Make.com ](http://Make.com)\
**欧洲公司：** Factorial、Attio、Tinybird、Clarity AI、Travelperk

**搜索的招聘平台：** Ashby、Greenhouse、Lever、Wellfound、Workable、RemoteFront

## 仪表盘

内置的终端仪表盘让你可视化浏览你的求职流程：

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```

功能：6 个过滤标签、4 种排序模式、分组/平面视图、延迟加载预览、内联状态更改。

## 项目结构

```plaintext
yoCareer/
├── CLAUDE.md                    # 代理指令
├── cv.md                        # 你的简历（需创建）
├── article-digest.md            # 你的证明材料（可选）
├── config/
│   └── profile.example.yml      # 个人资料模板
├── modes/                       # 14 种技能模式
│   ├── _shared.md              # 共享上下文（自定义此文件）
│   ├── oferta.md               # 单次评估
│   ├── pdf.md                  # PDF 生成
│   ├── scan.md                 # 平台扫描器
│   ├── batch.md                # 批量处理
│   └── ...
├── templates/
│   ├── cv-template.html        # ATS 优化简历模板
│   ├── portals.example.yml     # 扫描器配置模板
│   └── states.yml              # 规范状态
├── batch/
│   ├── batch-prompt.md         # 独立工作进程提示
│   └── batch-runner.sh         # 编排脚本
├── dashboard/                   # Go TUI 流程查看器
├── data/                        # 你的跟踪数据（已忽略）
├── reports/                     # 评估报告（已忽略）
├── output/                      # 生成的 PDF（已忽略）
├── fonts/                       # Space Grotesk + DM Sans
├── docs/                        # 设置、自定义、架构
└── examples/                    # 示例简历、报告、证明材料
```

## 技术栈

- **代理**：Claude Code，带自定义技能和模式

- **PDF**: Playwright/Puppeteer + HTML 模板

- **扫描器**：Playwright + Greenhouse API + WebSearch

- **仪表盘**：Go + Bubble Tea + Lipgloss（Catppuccin Mocha 主题）

- **数据**：Markdown 表格 + YAML 配置 + TSV 批处理文件

## 相关项目

- [**cv-santiago**](https://github.com/ZCDeng/yoCareer/tree/main/examples) -- 作品集网站（[github.com/ZCDeng/yoCareer），带有](http://github.com/ZCDeng/yoCareer%EF%BC%89%EF%BC%8C%E5%B8%A6%E6%9C%89) AI 聊天机器人、LLMOps 仪表盘和案例研究。如果你需要一个作品集来配合求职展示，fork 它并使其成为你自己的。

## 关于作者

我的作品集和其他开源项目 → https://github.com/ZCDeng/Boris-Token-Slim

## 重要免责声明

**yoCareer 是一个本地开源工具 -- 不是托管服务。** 使用本软件即表示你确认：

1. **你控制你的数据。** 你的简历、联系信息和个人数据保留在你的机器上，并直接发送到你选择的 AI 提供商（Anthropic、OpenAI 等）。我们不收集、存储或访问你的任何数据。

2. **你控制 AI。** 默认提示指示 AI 不要自动提交申请，但 AI 模型可能表现不可预测。如果你修改提示或使用不同的模型，风险自负。**在提交前始终审查 AI 生成的内容的准确性。**

3. **你遵守第三方服务条款。** 你必须按照你交互的招聘平台（Greenhouse、Lever、Workday、LinkedIn 等）的服务条款使用此工具。不要使用此工具向雇主发送垃圾邮件或使 ATS 系统过载。

4. **无保证。** 评估是建议，而非真理。AI 模型可能会臆造技能或经验。作者对就业结果、被拒绝的申请、账户限制或任何其他后果不承担责任。

详见 [LEGAL_DISCLAIMER.md](https://github.com/ZCDeng/yoCareer/blob/main/LEGAL_DISCLAIMER.md)。本软件根据 [MIT 许可证](https://github.com/ZCDeng/yoCareer/blob/main/LICENSE)“按原样”提供，不提供任何形式的保证。

## 贡献者

使用 yoCareer 找到工作了？[分享你的故事！](https://github.com/ZCDeng/yoCareer/issues/new?template=i-got-hired.yml)

## 许可证

代码根据 [MIT](https://github.com/ZCDeng/yoCareer/blob/main/LICENSE) 许可。“yoCareer”名称和品牌受[商标政策](https://github.com/ZCDeng/yoCareer/blob/main/TRADEMARK.md)约束 -- 对社区使用宽松，但保留商业产品命名和背书权。
