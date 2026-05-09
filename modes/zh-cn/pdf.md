# 模式：pdf — 中文 ATS 优化简历生成

中文模式专用 PDF 生成流程。**默认走 `templates/cv-template.cn.html` / `cv-template.cn.tex`**（CJK 字体、xeCJK 编译、ATS selftest 强制 zh-cn 模式）。

> 英文/拉丁场景请走 `modes/pdf.md`。两者只在模板选择 + 关键词举例 + ATS selftest lang 上有差别，主流程相同。

## 完整流水线

按顺序执行。第 5 步**强制**在第 6 步之前完成。

1. 读 `cv.md` 作为内容真相来源
2. 没有 JD 时找用户要（文本或 URL）
3. 从 JD 抽 15-20 个关键词（中文为主，混排英文术语保留）
4. 检测 JD 语言 → 简历语言。**默认中文**（包括公司是国内分支但 JD 写中文的场景）。
5. **模板选择**（关键步骤）：
   - JD/CV 含 CJK 内容 OR `language.modes_dir == modes/zh-cn` → 用 `templates/cv-template.cn.html` 和 `templates/cv-template.cn.tex`
   - 不要用 `cv-template.html`（Latin-only Space Grotesk + DM Sans，CJK 渲染成框框字符）
5b. **主题选择 (`{{THEME}}`)**——读 `templates/cv-system/themes.md`，按决策树选：
   - 金融 / 银行 / 咨询 / 央企 / 大厂保守岗 → `corporate-navy`
   - AI / 互联网 / 大模型 / 创业公司 → `tech-indigo`
   - 学术 / 研究院 / 国家实验室 / 海外 PhD → `academia-forest`
   - ATS 严苛 / B&W 打印 / 无障碍 → `minimal-mono`
   - 没强信号 → `default`（保留原 cyan + purple 配色）
5c. **Layout 选择**——读 `templates/cv-system/layouts.md`：
   - 工作 5 年以上 → Variant A（Senior）
   - 应届 / < 3 年 → Variant B（Education-first）
   - 转岗 + 强 portfolio → Variant C
   - 学术研究岗 → Variant D
6. 检测公司位置 → 纸张：
   - 国内 / 港澳 / 海外华人圈 → `a4`（A4 是国内默认）
   - US/Canada → `letter`
7. 检测 archetype（参考 `modes/zh-cn/_shared.md` 的 Archetype 表）→ 调整 framing
8. 改写 Professional Summary（**中文**叙述 + 英文术语）：
   - 注入 JD 关键词
   - 加上 exit narrative bridge：例如"5 年 SaaS 创业并退出。现在专注于大模型应用落地与工程化。"
9. 选 top 3-4 个最相关项目
10. 按 JD 相关度重排经历 bullet
11. Core Competencies 网格（6-8 个 keyword phrases，**中英文混排**）
12. 关键词自然注入既有成绩（**绝不编造**）
13. 从 `config/profile.yml` 读 `name`，转 kebab-case 拼音 lowercase（"张伟" → "zhangwei"），作为 `{candidate}`
14. 从模板生成完整 HTML。**记得替换 `{{THEME}}`**（5b 选好的）；漏了的话 `<html data-theme="">` 会落到 `:root` 默认值——能跑但失去主动选 theme 的意义。
15. 写到 `/tmp/cv-{candidate}-{company}.html`
16. 执行：
    ```bash
    node generate-pdf.mjs /tmp/cv-{candidate}-{company}.html \
      output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf --format=a4
    ```
    > `generate-pdf.mjs` **会自动跑 ATS selftest**（基于 `<html lang>` + 第一个 `<h1>` 推断 lang/name），
    > pdftotext 缺失时打印 `ATS selftest skipped` 然后 exit 0；selftest 失败默认软警告（PDF 仍写出）。
    > 想阻塞 PDF 输出加 `--ats-strict`；要绕过自检用 `--no-ats-check`。
17. **强制 ATS selftest**（auto 跑过一次后再手动复核一次 JSON 报告，CJK 场景必须）：
    ```bash
    node tests/cv-ats-selftest.mjs \
      output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf \
      --lang=zh-cn --name="{candidate-full-name}"
    ```
    - `passed: false` 或任意 `check.passed: false` → **必须**把 JSON 报告给用户看，问要不要修后再 mark ✅
    - `chinese_readability` 失败 → 字体没渲染对（多半是网络问题或 fonts/ 子集没装）
    - `field_order` 失败 → 模板布局把 header 拆了（layout bug）
18. 报告：PDF 路径、页数、**应用的 theme**、**应用的 layout**、关键词覆盖率、ATS selftest 结果。
19. **最终 checklist**——按 `templates/cv-system/checklist.md` 的 P0 / P1 跑一遍。P0 已经被 ATS selftest 自动覆盖；P1 是手工验证（字号 >= 10px、CJK 行高 >= 1.7、边距 >= 0.5in、双语 section title 等）。

## 字体回退链（CJK）

`templates/cv-template.cn.html` 按下面顺序找字体：

1. **Noto Sans SC**（Google Fonts CDN 远程） — 首选，效果最好
2. **PingFang SC** / **Hiragino Sans GB** — macOS 系统字体
3. **Microsoft YaHei** — Windows 系统字体
4. **`yoCareer CJK`** — 仓库内 `fonts/noto-sans-sc-subset.woff2`（常用 3500 字 + Latin 子集，~1.3MB）

GFW / 离线场景下走第 4 级，PDF 不会出框框字符。子集如果缺字（极冷僻字），浏览器原生 fallback 接管。

字体子集重建：`bash fonts/build-cjk-subset.sh`（需 `pyftsubset`，见脚本头注释）。

## ATS 规则（中文 CV 特别注意）

- **单列 layout**（不要 sidebar / 双栏 / 网格——`tests/cv-ats-selftest.mjs` 的 `field_order` 校验会卡住）
- **标准 section 标题**：「专业摘要 / Professional Summary」「工作经历 / Work Experience」「教育经历 / Education」「技能 / Skills」「证书 / Certifications」「项目 / Projects」（**双语标注**对国内 ATS 友好）
- 不要在图片里塞文字；不要在 SVG 里塞文字
- PDF header / footer 不放关键信息（国内 ATS 同样会忽略）
- UTF-8、文本可选中（不要光栅化）
- 不要嵌套表格
- 关键词分布：Summary 顶部 5 个、每个角色第一 bullet、Skills section 集中
- **中英文混排空格规则**：英文单词前后留半角空格（"使用 Python 实现"，不是"使用Python实现"）

## 设计（PDF 视觉）

- **字体：** Noto Sans SC（中文主体）+ DM Sans（英文 / 数字回退）
- **Header：** 名字 24px bold，渐变线 `linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%))` 2px，下面联系信息一行
- **Section header：** Noto Sans SC 13px，加粗，色 cyan primary
- **Body：** 11px，line-height 1.75（CJK 比 Latin 需要更宽行距）
- **公司名：** accent purple `hsl(270,70%,45%)`
- **边距：** 0.6in
- **背景：** 纯白
- **`word-break: keep-all`**（CJK 不要在词中间断行）

## 排序（"6 秒招聘人扫描"优化）

1. Header（名字大，渐变线，联系方式，作品集 URL）
2. Professional Summary / 专业摘要（3-4 行，关键词密度高）
3. Core Competencies / 核心能力（6-8 keyword 网格）
4. Work Experience / 工作经历（倒序）
5. Projects / 项目（top 3-4 最相关）
6. Education / 教育 & Certifications / 证书
7. Skills / 技能（语言 + 技术）

> 注：senior CV 推荐 Experience 在 Education 前；新毕业生推荐 Education 优先。`tests/cv-ats-selftest.mjs:CANONICAL_ORDER` 现在两种顺序都接受，只要 header（name → phone → email）在 body 之前即可。

## 关键词注入策略（中文场景示例）

不要造没有的技能，只用 JD 的精确措辞重新表达真实经历：

- JD 写"RAG 工程"，CV 原文"用向量库做检索增强问答" → 改成"RAG 工程：向量库 + 检索增强生成系统设计"
- JD 写"大模型落地"，CV 原文"做了 ChatBot 应用" → 改成"大模型应用落地：ChatBot 全链路（检索/生成/评估/上线）"
- JD 写"Agent 工程"，CV 原文"多步 LLM 调用" → 改成"Agent 编排：多步推理 + 工具调用 + HITL 闭环"
- JD 写"AIGC 产品"，CV 原文"AI 内容生成功能" → 改成"AIGC 产品功能：内容生成 + 个性化推荐"

**底线：** 永远不加 CV 里没有的能力。只用 JD 的语言重新陈述真实经历。

## 模板占位符

`cv-template.cn.html` 的 `{{...}}` 占位符（与 `cv-template.html` 一致，方便维护）：

| 占位符 | 内容 |
|---------|------|
| `{{LANG}}` | `zh-CN` |
| `{{THEME}}` | `default` / `corporate-navy` / `minimal-mono` / `tech-indigo` / `academia-forest`（见 `templates/cv-system/themes.md`） |
| `{{PAGE_WIDTH}}` | `210mm`（A4） |
| `{{NAME}}` | 来自 profile.yml |
| `{{PHONE}}` | 来自 profile.yml（无值则同时省略 `<span>` 和 `<span class="separator">`） |
| `{{EMAIL}}` | 来自 profile.yml |
| `{{LOCATION}}` | 来自 profile.yml |
| `{{LINKEDIN_URL}}` / `{{LINKEDIN_DISPLAY}}` | 同上 |
| `{{PORTFOLIO_URL}}` / `{{PORTFOLIO_DISPLAY}}` | 同上 |
| `{{SECTION_SUMMARY}}` | "专业摘要"（双语 fallback "Professional Summary"） |
| `{{SUMMARY_TEXT}}` | 个性化的 summary，含关键词 |
| `{{SECTION_COMPETENCIES}}` / `{{COMPETENCIES}}` | 核心能力 / 6-8 个 `<span class="competency-tag">` |
| `{{SECTION_EXPERIENCE}}` / `{{EXPERIENCE}}` | 工作经历 |
| `{{SECTION_PROJECTS}}` / `{{PROJECTS}}` | 项目（top 3-4） |
| `{{SECTION_EDUCATION}}` / `{{EDUCATION}}` | 教育 |
| `{{SECTION_CERTIFICATIONS}}` / `{{CERTIFICATIONS}}` | 证书 |
| `{{SECTION_SKILLS}}` / `{{SKILLS}}` | 技能 |

## LaTeX 路径

如需 LaTeX 渲染（更精细的版式 / 学术风），用 `cv-template.cn.tex`（xelatex + xeCJK + ctexart）：

```bash
node generate-latex.mjs templates/cv-template.cn.tex \
  output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf
```

要求：本机装 `xelatex`（macOS: `brew install --cask mactex` 或 `brew install --cask basictex` 后 `tlmgr install ctex`；Linux: `apt install texlive-xetex texlive-lang-chinese`）。`generate-latex.mjs` 会自动检测引擎优先级 `tectonic > pdflatex > xelatex`，CJK 模板里通过 `% !TeX program = xelatex` 强制走 xelatex。

## 生成后

如 offer 已在 tracker 注册，把对应行 PDF 列从 ❌ 改 ✅。

## Common 错误处理

| 报错 / 现象 | 排查 |
|----|----|
| ATS selftest `chinese_readability: passed=false`，issues 里有 U+FFFD | 字体没加载。检查 1) 网络是否能到 fonts.googleapis.com 2) `fonts/noto-sans-sc-subset.woff2` 是否存在 |
| ATS selftest `field_order: passed=false` | 模板 layout 拆了 header（headers 不在 body 之前）。检查 `<header>` 的 CSS 是否被 `position: absolute` 或 sidebar 拉到了页面下方 |
| pdftotext 输出有空白方框 | 系统中文字体缺失。在 macOS 上系统装 PingFang SC（自带）；Linux 上 `apt install fonts-noto-cjk` |
| LaTeX 报 `Package fontspec error: The font ... cannot be found` | 系统没装 Noto Sans SC 或对应 OTF。CJK LaTeX 路径需要本机字体；HTML 路径不需要（用 fonts/ 子集兜底） |
