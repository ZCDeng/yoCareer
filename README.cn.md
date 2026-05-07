# yoCareer

[English](README.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [한국어](README.ko-KR.md) | [日本語](README.ja.md) | [Русский](README.ru.md) | [简体中文](README.cn.md) | [繁體中文](README.zh-TW.md)

<p align="center">
  <a href="https://x.com/ZCDeng"><img src="docs/hero-banner.jpg" alt="yoCareer — 多代理求职系统" width="800"></a>
</p>

<p align="center">
  <em>我花了好几个月用最费力的方式找工作。所以我打造了一个当初就希望拥有的系统。</em><br>
  公司用 AI 筛选候选人。<strong>我把 AI 交给候选人，让他们来<em>挑选</em>公司。</strong><br>
  <em>现在，它开源了。</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white" alt="Claude Code">
  <img src="https://img.shields.io/badge/OpenCode-111827?style=flat&logo=terminal&logoColor=white" alt="OpenCode">
  <img src="https://img.shields.io/badge/Codex_(soon)-6B7280?style=flat&logo=openai&logoColor=white" alt="Codex">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white" alt="Go">
  <img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white" alt="Playwright">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <a href="https://discord.gg/8pRpHETxa4"><img src="https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white" alt="Discord"></a>
  <br>
  <img src="https://img.shields.io/badge/EN-blue?style=flat" alt="EN">
  <img src="https://img.shields.io/badge/ES-red?style=flat" alt="ES">
  <img src="https://img.shields.io/badge/DE-grey?style=flat" alt="DE">
  <img src="https://img.shields.io/badge/FR-blue?style=flat" alt="FR">
  <img src="https://img.shields.io/badge/PT--BR-green?style=flat" alt="PT-BR">
  <img src="https://img.shields.io/badge/KO-white?style=flat" alt="KO">
  <img src="https://img.shields.io/badge/JA-red?style=flat" alt="JA">
  <img src="https://img.shields.io/badge/ZH--CN-red?style=flat" alt="ZH-CN">
  <img src="https://img.shields.io/badge/ZH--TW-blue?style=flat" alt="ZH-TW">
</p>

---

<p align="center">
  <img src="docs/demo.gif" alt="yoCareer 演示" width="800">
</p>

<p align="center"><strong>评估超过 740 个职位 · 生成超过 100 份个性化简历 · 成功拿下理想职位</strong></p>

<p align="center"><a href="https://discord.gg/8pRpHETxa4"><img src="https://img.shields.io/badge/加入社区-Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a></p>

## 这是什么

yoCareer 可以把任何 AI 编码 CLI 变成完整的求职指挥中心。你不需要再手动用电子表格追踪申请流程，而是获得一个 AI 驱动的管道，能够：

- **评估职位**，使用结构化的 A-F 评分系统（10 个加权维度）
- **生成定制 PDF**，针对每份职位描述输出 ATS 优化简历
- **自动扫描招聘信号**（公司官网职位页 + 社媒/社区公开信号 + 手工导入）
- **批量处理**，通过子代理并行评估 10 份以上职位
- **集中管理一切**，用单一事实来源配合完整性检查

> **重要：这不是海投工具。** yoCareer 是一个过滤器，帮你从数百个职位里找出真正值得投入时间的少数机会。系统强烈建议不要申请评分低于 4.0/5 的职位。你的时间很宝贵，招聘方的时间也一样。提交前一定要自己复核。

yoCareer 具备代理式工作能力：Claude Code 会用 Playwright 浏览招聘页面，通过推理你的简历与职位描述是否匹配来评估契合度，而不是只做关键词匹配；同时它也会根据每个职位调整你的简历。

> **提醒：最开始几次评估不会特别准。** 系统还不了解你。请给它更多上下文，比如你的简历、职业故事、成果证明、个人偏好、擅长的事、想避开的事。你喂给它的信息越多，它就越准确。把它当成在培养一个新招聘顾问：第一周它需要先了解你，之后就会变得非常有价值。

这个系统的作者曾用它评估 740 多个职位、生成 100 多份定制简历，并拿到一份 Head of Applied AI 的工作。[阅读完整案例研究](https://github.com/ZCDeng/yoCareer)。

## 功能特性

| 功能 | 说明 |
|------|------|
| **自动管道** | 粘贴一个 URL，即可获得完整评估 + PDF + 追踪记录 |
| **6 个评估模块** | 职位总结、简历匹配、职级策略、薪酬调研、个性化建议、面试准备（STAR+R） |
| **面试故事库** | 跨多次评估积累 STAR+Reflection 故事，沉淀出 5-10 个可回答任意行为面试题的主线故事 |
| **谈薪脚本** | 薪资谈判框架、地域折扣反驳话术、竞品 offer 杠杆策略 |
| **ATS PDF 生成** | 注入关键词的简历，采用 Space Grotesk + DM Sans 设计 |
| **招聘信号扫描器** | China-first provider 架构：公司官网职位页 + 社媒/社区信号 + 手工导入 + 人工复核队列 |
| **批量处理** | 使用 `claude -p` worker 并行评估 |
| **Dashboard TUI** | 在终端 UI 中浏览、筛选和排序你的求职管道 |
| **人类在环** | AI 负责评估和建议，你负责决定和行动。系统绝不会自动提交申请，最终决定始终在你手上 |
| **管道完整性** | 自动合并、去重、状态标准化和健康检查 |

## 快速开始

```bash
# 1. 克隆并安装
git clone https://github.com/ZCDeng/yoCareer.git
cd yoCareer && npm install
npx playwright install chromium   # 生成 PDF 所需

# 2. 检查环境
npm run doctor                     # 验证所有前置条件

# 3. 配置
cp config/profile.example.yml config/profile.yml  # 填入你的信息
cp templates/portals.example.yml portals.yml       # 自定义目标公司

# 4. 添加你的简历
# 在项目根目录创建 cv.md，并用 Markdown 写入你的简历

# 5. 用 Claude 做个性化配置
claude   # 在当前目录打开 Claude Code

# 然后让 Claude 帮你把系统调成适合你的版本：
# "把职业原型改成后端工程岗位"
# "把 modes 翻译成简体中文"
# "把这 5 家公司加入 portals.yml"
# "用我贴过来的这份简历更新个人档案"

# 6. 开始使用
# 粘贴一个职位 URL，或运行 /yoCareer
```

> **这个系统本来就是设计给 Claude 直接定制的。** modes、职业原型、评分权重、谈判脚本，直接告诉 Claude 要改什么就行。Claude 读取的正是它自己会使用的那些文件，所以它知道该改哪里。

完整配置指南见 [docs/SETUP.md](docs/SETUP.md)。

## 用法

yoCareer 是一个单一斜杠命令，带有多种模式：

```
/yoCareer                → 显示所有可用命令
/yoCareer {粘贴职位描述}  → 完整自动管道（评估 + PDF + 追踪）
/yoCareer scan           → 扫描平台上的新职位
/yoCareer pdf            → 生成 ATS 优化简历
/yoCareer batch          → 批量评估多个职位
/yoCareer tracker        → 查看申请状态
/yoCareer apply          → 用 AI 协助填写申请表
/yoCareer pipeline       → 处理待办 URL
/yoCareer contacto       → 生成 LinkedIn 外联消息
/yoCareer deep           → 深度公司研究
/yoCareer training       → 评估课程/证书
/yoCareer project        → 评估作品集项目
```

或者直接粘贴职位 URL 或职位描述，yoCareer 会自动识别并运行完整流程。

## 工作原理

```
粘贴职位 URL 或职位描述
        │
        ▼
┌──────────────────┐
│  职业原型检测    │  分类：LLMOps / Agentic / PM / SA / FDE / Transformation
└────────┬─────────┘
         │
┌────────▼─────────┐
│  A-F 评估        │  匹配度、能力缺口、薪酬调研、STAR 故事
│  （读取 cv.md）  │
└────────┬─────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
  报告  PDF  追踪
  .md  .pdf  .tsv
```

## 招聘平台扫描器（国内默认）

扫描器已切换为 **China-first provider 架构**，默认围绕国内用户场景：

- `company_page`：优先扫描公司公开招聘页（Playwright）
- `manual_signal_import`：接收你手工导入的碎片信号（`data/signals.ndjson`）
- `reach_signal_search`：可选公共信号搜索 bridge
- `manual_only`：登录/风控平台默认仅人工导入与复核

默认模板位于 `templates/portals.example.yml`（中文版 `templates/portals.cn.example.yml`），已内置：

- 国内技术公司与 AI 公司跟踪列表（如阿里、腾讯、字节、华为、百度、美团、京东、小米、快手、月之暗面）
- 适合中国求职市场的 `title_filter`（AI + 工程 + 产品/运营/增长）
- 社媒和社区信号入口（微博 / 小红书 / V2EX / GitHub 等）

可选增强：关联 Aditly 作为外部抓取能力，详见 [docs/ADITLY_INTEGRATION.md](docs/ADITLY_INTEGRATION.md)。

## Dashboard TUI

内置终端仪表盘可以让你更直观地浏览整个求职管道：

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```

功能包括：6 个筛选标签、4 种排序模式、分组/平铺视图、懒加载预览、行内状态修改。

## 项目结构

```
yoCareer/
├── CLAUDE.md                    # 代理说明
├── cv.md                        # 你的简历（需要自行创建）
├── article-digest.md            # 你的成果证明（可选）
├── config/
│   └── profile.example.yml      # 个人档案模板
├── modes/                       # 14 个技能模式
│   ├── _shared.md               # 共享上下文（在这里自定义）
│   ├── oferta.md                # 单个职位评估
│   ├── pdf.md                   # PDF 生成
│   ├── scan.md                  # 平台扫描器
│   ├── batch.md                 # 批量处理
│   └── ...
├── templates/
│   ├── cv-template.html         # ATS 优化简历模板
│   ├── portals.example.yml      # 扫描器配置模板
│   └── states.yml               # 规范状态列表
├── batch/
│   ├── batch-prompt.md          # 自包含 worker 提示词
│   └── batch-runner.sh          # 编排脚本
├── dashboard/                   # Go TUI 管道查看器
├── data/                        # 你的追踪数据（已 gitignore）
├── reports/                     # 评估报告（已 gitignore）
├── output/                      # 生成的 PDF（已 gitignore）
├── fonts/                       # Space Grotesk + DM Sans
├── docs/                        # 配置、定制、架构说明
└── examples/                    # 示例简历、报告、成果证明
```

## 技术栈

![Claude Code](https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![Bubble Tea](https://img.shields.io/badge/Bubble_Tea-FF75B5?style=flat&logo=go&logoColor=white)

- **代理**：Claude Code，配合自定义技能与 modes
- **PDF**：Playwright/Puppeteer + HTML 模板
- **扫描器**：Provider pipeline（company_page / manual_signal_import / reach_signal_search / manual_only）+ Playwright + optional Aditly MCP bridge
- **Dashboard**：Go + Bubble Tea + Lipgloss（Catppuccin Mocha 主题）
- **数据**：Markdown 表格 + YAML 配置 + TSV 批处理文件

## 也已开源

- **[portfolio-example](https://github.com/ZCDeng/yoCareer/tree/main/examples)**：作品集示例（github.com/ZCDeng/yoCareer），包含 AI 聊天机器人、LLMOps Dashboard 和案例研究。如果你也需要一个能在求职时展示的作品集，可以 fork 它然后改成自己的版本。

## 关于作者

我的作品集和其他开源项目 → https://github.com/ZCDeng/Boris-Token-Slim

## Star 历史

<a href="https://www.star-history.com/?repos=ZCDeng%2FyoCareer&type=timeline&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ZCDeng/yoCareer&type=timeline&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ZCDeng/yoCareer&type=timeline&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ZCDeng/yoCareer&type=timeline&legend=top-left" />
 </picture>
</a>

## 免责声明

**yoCareer 是一个本地开源工具，不是托管服务。** 使用本软件即表示你确认：

1. **数据由你掌控。** 你的简历、联系方式和个人数据都保留在你的设备上，并直接发送给你选择的 AI 提供商（Anthropic、OpenAI 等）。我们不会收集、存储或访问你的任何数据。
2. **AI 由你掌控。** 默认提示词会明确要求 AI 不要自动提交申请，但 AI 模型的行为可能不可预测。如果你修改提示词或使用不同模型，风险由你自行承担。**提交前务必核查 AI 生成内容的准确性。**
3. **你需要遵守第三方服务条款。** 你必须按照所使用招聘平台（Greenhouse、Lever、Workday、LinkedIn 等）的服务条款来使用本工具。不要用它向雇主发送垃圾申请，也不要对 ATS 系统造成过载。
4. **不提供任何保证。** 评估结果只是建议，不是真相。AI 模型可能会幻觉出并不存在的技能或经历。作者不对任何求职结果、申请被拒、账号受限或其他后果承担责任。

完整内容见 [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md)。本软件依据 [MIT License](LICENSE) 以“按现状”方式提供，不附带任何形式的担保。
