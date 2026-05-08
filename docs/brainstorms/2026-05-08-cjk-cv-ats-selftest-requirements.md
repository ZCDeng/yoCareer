---
date: 2026-05-08
topic: cjk-cv-ats-selftest
---

# Requirements: CJK-first CV 渲染 + ATS 自检

## Summary

为 yoCareer 新增中文 CV 渲染模板（HTML + LaTeX 双通路）和 ATS 自检工具，解决国内求职者使用现有模板时 CJK 字体缺失、ATS 解析失败的问题。

---

## Problem Frame

yoCareer 定位为 "China-market workflows"，但默认 CV 模板完全面向拉丁字符集：`cv-template.html` 仅声明 Space Grotesk + DM Sans（无 CJK unicode-range），`cv-template.tex` 使用标准 `article` 文档类 + `[english]{babel}`（无 xeCJK/ctex 支持）。国内求职者生成 PDF 后，中文字体回退到系统默认（通常是低质量衬线字体），排版断裂，专业感骤降。

更严重的是下游 ATS（北森、MokaHR、智联、猎聘）对 CJK 渲染顺序和文本提取顺序敏感。当前系统没有任何机制验证 "PDF 生成后中文是否可被正确提取" —— 用户可能在投递后才发现 ATS 解析出的简历是乱序或乱码，此时已无法挽回。

---

## Requirements

**中文 CV HTML 模板**

- R1. 新增 `templates/cv-template.cn.html`，结构与 `cv-template.html` 一致，但使用 CJK 字体栈（Noto Sans SC / Source Han Sans）替代 Latin-only 字体
- R2. HTML 模板通过 Google Fonts CDN 加载 Noto Sans SC，不依赖本地字体文件分发
- R3. HTML 模板声明 `lang="zh-CN"` 和正确的 CJK unicode-range
- R4. HTML 模板的 CSS 针对中文排版优化：行高、字间距、标点悬挂、段落缩进

**中文 CV LaTeX 模板**

- R5. 新增 `templates/cv-template.cn.tex`，基于现有 `cv-template.tex` 结构，但使用 `ctexart` 文档类 + `xeCJK` 宏包
- R6. LaTeX 模板在文件头部声明 `% !TeX program = xelatex`，强制使用 XeLaTeX 编译
- R7. LaTeX 模板配置思源黑体（Source Han Sans / Noto Sans CJK SC）作为中文字体，Latin 字体保持现有栈作为回退
- R8. LaTeX 模板针对中文排版调整：段间距、列表缩进、日期格式、标点符号

**ATS 自检工具**

- R9. 新增 `tests/cv-ats-selftest.mjs`，输入为 PDF 文件路径，输出为自检报告
- R10. 自检流程：调用 `pdftotext -layout` 提取 PDF 文本 → 正则匹配关键字段（姓名、电话、邮箱、教育经历、工作经历）→ 验证字段按文档顺序出现
- R11. 自检验证中文文本可读性：检查提取结果中无乱码、无空方块、无异常 Unicode 替换字符
- R12. 自检脚本在 `pdftotext` 未安装时优雅降级：输出 warn 并跳过，exit 0（不阻塞 CI）

**CI 集成**

- R13. `test-all.mjs` 新增 Section：CV ATS Self-Test，在现有检查之后运行
- R14. CI 自检使用一个预置的 "金丝雀 CV"（包含标准中文简历内容）作为输入，验证模板渲染 + 提取链路完整

---

## Success Criteria

- 国内用户使用 `/yoCareer pdf --lang zh-cn` 生成的 PDF，中文字体清晰、排版专业、无乱码
- 运行 `pdftotext -layout` 后，提取文本中「姓名/电话/邮箱/教育/工作经历」按正确顺序出现
- `test-all.mjs` 全量通过，新增 ATS 自检 section 无失败
- 英文用户完全不受影响（默认模板、现有行为零变更）

---

## Scope Boundaries

- 不修改 `cv-template.html` 或 `cv-template.tex`（保留现有英文模板不变）
- 不引入字体文件到仓库（使用 CDN / 系统字体 / TeX 发行版自带字体）
- 不修改 `generate-pdf.mjs` 的核心渲染逻辑（只增加语言路由或模板选择参数）
- 不处理 Canva 集成的中文模板（只处理本地 HTML + LaTeX 通路）
- 不修改 `cv.md` 数据契约或证明库架构
- 不自检 ATS 的语义理解能力（只验证文本提取顺序和可读性）

---

## Key Decisions

- **HTML 模板用 Google Fonts CDN 而非本地字体**：避免版权纠纷和仓库体积膨胀，国内用户可通过镜像加速
- **LaTeX 模板强制 xelatex**：xeCJK 是目前中文 LaTeX 的社区标准，pdflatex 不支持系统字体和 Unicode CJK
- **自检使用 `pdftotext` 而非模拟 ATS 解析器**：`pdftotext` 提取的 reading order 是各 ATS 解析的基础输入，覆盖核心风险面；模拟具体 ATS（北森/MokaHR 等）不可行（闭源、协议变更）
- **中文模板不替换默认模板**：通过 `--lang zh-cn` 或 `config/profile.yml` 显式选择，避免破坏英文用户

---

## Dependencies / Assumptions

- 假设用户环境有可用的网络连接（HTML 模板从 Google Fonts CDN 加载）
- 假设 CI 环境或用户本地已安装 `pdftotext`（poppler-utils 包）用于自检；如未安装则跳过
- 假设用户本地 LaTeX 环境为 TeX Live / MiKTeX 且包含 ctex 宏包（TeX Live 完整安装默认包含）
- 依赖：`generate-pdf.mjs` 和 `generate-latex.mjs` 支持模板路径参数或语言路由（可能需要小幅修改以接受 `--template` 或 `--lang` 参数）

---

## Outstanding Questions

### Deferred to Planning

- [R5][Technical] LaTeX 模板中思源黑体的精确包名和字体路径在不同 TeX 发行版中是否一致？（TeX Live vs MiKTeX vs Overleaf）
- [R10][Needs research] `pdftotext -layout` 的提取结果中，reading order 是否与视觉顺序完全一致？是否需要 `-raw` 或其他参数作为补充验证？
