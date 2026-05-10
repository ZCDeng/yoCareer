# yoCareer Extension — 商店描述

## 中文描述

### 标题
yoCareer — AI 求职助手

### 简短描述（最多 132 字符）
一键保存 BOSS直聘、拉勾、智联招聘职位到 yoCareer，AI 自动评估 offer 质量。

### 完整描述
yoCareer 是开源的 AI 求职自动化系统。这款浏览器扩展让你一键保存国内主流招聘平台的职位信息，同步到本地的 yoCareer daemon 进行 AI 评估和跟踪。

**支持的招聘平台：**
- BOSS直聘 (zhipin.com)
- 拉勾网 (lagou.com)
- 智联招聘 (zhaopin.com)

**主要功能：**
- 浏览职位时，点击扩展图标自动提取公司、岗位、薪资、地点、JD 等信息
- 通过 6 位配对码安全连接到本地 yoCareer daemon
- 一键保存职位到 yoCareer 的 Signals  inbox
- 与 yoCareer Web 仪表盘实时同步

**隐私说明：**
- 所有数据存储在本地（localhost:8650），不上传到任何第三方服务器
- 扩展仅访问上述三个招聘平台的页面
- 开源代码：https://github.com/ZCDeng/yoCareer

**使用前提：**
需要在本地运行 yoCareer daemon（`npm run daemon`）。详见项目文档。

---

## English Description

### Title
yoCareer — AI Job Search Assistant

### Short Description
Save job postings from Chinese recruiting platforms to yoCareer for AI-powered evaluation.

### Full Description
yoCareer is an open-source AI job search automation system. This browser extension lets you save job postings from major Chinese recruiting platforms with one click, syncing to your local yoCareer daemon for AI evaluation and tracking.

**Supported Platforms:**
- BOSS Zhipin (zhipin.com)
- Lagou (lagou.com)
- Zhaopin (zhaopin.com)

**Key Features:**
- Automatically extract company, role, salary, location, and JD when browsing listings
- Securely connect to local yoCareer daemon via 6-digit pairing code
- One-click save to yoCareer Signals inbox
- Real-time sync with yoCareer Web dashboard

**Privacy:**
- All data stored locally (localhost:8650), never uploaded to third-party servers
- Extension only accesses the three recruiting platforms listed above
- Open source: https://github.com/ZCDeng/yoCareer

**Prerequisite:**
Requires local yoCareer daemon running (`npm run daemon`). See project documentation for setup.
