---
title: CJK-first CV 渲染 + ATS 自检
type: feat
status: active
date: 2026-05-08
origin: docs/brainstorms/2026-05-08-cjk-cv-ats-selftest-requirements.md
---

# Plan: CJK-first CV 渲染 + ATS 自检

## Summary

为 yoCareer 新增中文 CV 渲染模板（HTML + LaTeX）和 ATS 自检工具，解决国内求职者使用现有模板时 CJK 字体缺失、ATS 解析失败的问题。通过 Google Fonts CDN 加载 Noto Sans SC 避免本地字体分发，通过 xelatex 编译 ctexart 文档类保证中文 LaTeX 输出质量，通过 `pdftotext -layout` 验证提取顺序和可读性，并将全链路验证集成到 `test-all.mjs`。

---

## Problem Frame

yoCareer 定位为 "China-market workflows"，但默认 CV 模板完全面向拉丁字符集。`cv-template.html` 仅声明 Space Grotesk + DM Sans（无 CJK unicode-range），`cv-template.tex` 使用标准 `article` 文档类 + `[english]{babel}`（无 xeCJK/ctex 支持）。国内求职者生成 PDF 后中文字体回退到系统默认，排版断裂。更严重的是下游 ATS 对 CJK 渲染顺序和文本提取顺序敏感，当前系统没有任何机制验证 "PDF 生成后中文是否可被正确提取"。（see origin: docs/brainstorms/2026-05-08-cjk-cv-ats-selftest-requirements.md）

---

## Requirements

- R1. 新增 `templates/cv-template.cn.html`，结构与 `cv-template.html` 一致，使用 CJK 字体栈（Noto Sans SC）
- R2. HTML 模板通过 Google Fonts CDN 加载 Noto Sans SC
- R3. HTML 模板声明 `lang="zh-CN"` 和正确的 CJK unicode-range
- R4. HTML 模板的 CSS 针对中文排版优化
- R5. 新增 `templates/cv-template.cn.tex`，基于 `cv-template.tex`，使用 `ctexart` + `xeCJK`
- R6. LaTeX 模板声明 `% !TeX program = xelatex`
- R7. LaTeX 模板配置思源黑体作为中文字体
- R8. LaTeX 模板针对中文排版调整
- R9. 新增 `tests/cv-ats-selftest.mjs`，输入 PDF，输出自检报告
- R10. 自检流程：`pdftotext -layout` → 正则匹配关键字段 → 验证字段顺序
- R11. 自检验证中文文本可读性（无乱码、无方块、无替换字符）
- R12. `pdftotext` 未安装时优雅降级（warn + exit 0）
- R13. `test-all.mjs` 新增 CV ATS Self-Test section
- R14. CI 使用预置金丝雀 CV 验证模板渲染 + 提取链路

**Origin actors:** 国内求职者（使用中文 JD、国内招聘平台）
**Origin flows:** 中文 CV 生成流程、ATS 自检流程

---

## Scope Boundaries

- 不修改 `cv-template.html` 或 `cv-template.tex`
- 不引入字体文件到仓库
- 不修改 `generate-pdf.mjs` / `generate-latex.mjs` 核心渲染逻辑（只增加 CDN allowlist 和引擎选择）
- 不处理 Canva 集成的中文模板
- 不修改 `cv.md` 数据契约
- 不自检 ATS 的语义理解能力（只验证文本提取顺序和可读性）

---

## Context & Research

### Relevant Code and Patterns

- `templates/cv-template.html` — HTML 模板结构，使用 `{{PLACEHOLDER}}` 替换，本地字体文件（`./fonts/`）
- `templates/cv-template.tex` — LaTeX 模板结构，`\section{Education}` 等硬编码标题
- `generate-pdf.mjs` — Playwright 渲染，route handler 拦截所有非本地请求，ATS normalizeTextForATS
- `generate-latex.mjs` — 引擎检测 `tectonic`/`pdflatex`，验证 required sections/commands，两阶段编译
- `test-all.mjs` — 10 个 section（1-10），新增 section 不影响现有检查

### External References

- Google Fonts: Noto Sans SC CDN (`https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300..900&display=swap`)
- ctex/xeCJK: 中文 LaTeX 社区标准，`ctexart` 文档类自动处理字体配置

---

## Key Technical Decisions

- **HTML 模板使用 Google Fonts CDN 而非本地字体**：避免版权纠纷和仓库体积膨胀。`generate-pdf.mjs` 的 Playwright route handler 需 allowlist `fonts.googleapis.com` 和 `fonts.gstatic.com`。（see origin R2 decision）
- **LaTeX 模板强制 xelatex**：通过 `% !TeX program = xelatex` 声明，`generate-latex.mjs` 解析该声明并优先选择 `xelatex` 引擎。pdflatex 不支持系统字体和 Unicode CJK。（see origin R6 decision）
- **中文模板保留英文 section 标题**：`cv-template.tex` 的 `\section{Education}` 等标题在中文模板中保持英文，避免修改 `generate-latex.mjs` 的 required-sections 验证逻辑。section 标题内容由 agent 填充时可替换为中文。
- **自检使用 `pdftotext -layout`**：`pdftotext` 提取的 reading order 是各 ATS 解析的基础输入。模拟具体 ATS（北森/MokaHR 等）不可行（闭源、协议变更）。（see origin R10 decision）
- **金丝雀 CV 为 HTML fixture**：预置填充好的中文简历 HTML（`tests/fixtures/canary-cv.cn.html`），CI 中通过 `generate-pdf.mjs` 生成 PDF 后自检。如果 Playwright 未安装则跳过该 section。

---

## Open Questions

### Resolved During Planning

- **LaTeX 中思源黑体的精确包名和字体路径在不同 TeX 发行版中是否一致？** → 使用 `ctexart` 文档类，其内置字体配置机制自动处理发行版差异。不直接指定 `\setCJKmainfont`，而是依赖 ctex 的默认配置。如果用户环境缺字体，ctex 会回退到可用字体并给出警告。
- **`pdftotext -layout` 的 reading order 是否与视觉顺序完全一致？** → 对于单栏 CV 文档，`-layout` 的 reading order 与视觉顺序高度一致。如果出现异常，自检脚本在注释中预留 `-raw` 参数作为补充验证的提示。

### Deferred to Implementation

- **Google Fonts CDN 在国内网络环境下的加载稳定性**：如果 CI/playwright 环境访问 Google Fonts 超时，可能需要使用国内镜像（如 `fonts.loli.net`）。在实现时通过超时重试或本地 CSS 内联来降级。
- **xelatex 编译时间**：首次编译可能需下载 ctex 宏包依赖（TeX Live 网络安装模式）。在 CI 环境中建议预装完整 TeX Live。

---

## Output Structure

```
templates/
  cv-template.cn.html              (NEW)
  cv-template.cn.tex               (NEW)
tests/
  cv-ats-selftest.mjs              (NEW)
  fixtures/
    canary-cv.cn.html              (NEW)
generate-pdf.mjs                   (MODIFY)
generate-latex.mjs                 (MODIFY)
test-all.mjs                       (MODIFY)
```

---

## Implementation Units

### U1. 中文 CV HTML 模板

**Goal:** 创建中文 CV HTML 渲染模板，使用 Noto Sans SC 和中文排版优化。

**Requirements:** R1, R2, R3, R4

**Dependencies:** None

**Files:**
- Create: `templates/cv-template.cn.html`

**Approach:**
- 复制 `cv-template.html` 的完整结构（所有 section、CSS class、占位符）
- 替换 `@font-face` 为 Google Fonts CDN 加载 Noto Sans SC（`https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300..900&display=swap`）
- 设置 `<html lang="zh-CN">`
- CSS 调整：
  - `body { font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif; }`
  - `line-height: 1.75`（中文需要更大行高）
  - 适当字间距（`letter-spacing: 0.02em`）
  - 标点符号不截断（`text-align: justify` + `word-break: keep-all`）
- 保留所有 `{{PLACEHOLDER}}` 不变，确保 agent 填充逻辑兼容

**Patterns to follow:**
- `templates/cv-template.html` — 结构和占位符命名

**Test scenarios:**
- Test expectation: none — template file, behavioral verification through rendering

**Verification:**
- 文件结构与英文模板一致，所有占位符完整
- CSS 包含 Noto Sans SC 字体栈和 CJK 排版优化
- `lang="zh-CN"` 声明正确

---

### U2. 中文 CV LaTeX 模板

**Goal:** 创建中文 CV LaTeX 渲染模板，使用 ctexart + xeCJK + 思源黑体。

**Requirements:** R5, R6, R7, R8

**Dependencies:** None

**Files:**
- Create: `templates/cv-template.cn.tex`

**Approach:**
- 复制 `cv-template.tex` 的完整结构（commands、section 布局、占位符）
- 文件头部添加 `% !TeX program = xelatex`
- 替换 `\documentclass[letterpaper,11pt]{article}` 为 `\documentclass[letterpaper,11pt,UTF8]{ctexart}`
- 移除 `\usepackage[english]{babel}`（ctexart 处理中文环境）
- 保留 `\input{glyphtounicode}` 和 `\pdfgentounicode=1`（ATS 兼容性）
- 调整中文排版：段间距、列表缩进适配中文
- 保留英文 section 标题（`\section{Education}` 等），避免破坏 `generate-latex.mjs` 验证

**Patterns to follow:**
- `templates/cv-template.tex` — 结构和命令定义

**Test scenarios:**
- Test expectation: none — template file

**Verification:**
- 文件包含 `% !TeX program = xelatex` 声明
- 使用 `ctexart` 文档类
- 包含 `xeCJK`（通过 ctexart 自动加载）
- 所有占位符完整，结构与英文模板一致

---

### U3. PDF/LaTeX 生成器中文适配

**Goal:** 让 `generate-pdf.mjs` 和 `generate-latex.mjs` 支持中文 CV 的渲染和编译。

**Requirements:** R2（间接，CDN 加载）, R6（间接，xelatex 编译）, R14

**Dependencies:** U1, U2

**Files:**
- Modify: `generate-pdf.mjs`
- Modify: `generate-latex.mjs`

**Approach:**

*`generate-pdf.mjs` 修改：*
- 在 `page.route('**/*')` handler 中增加 Google Fonts CDN allowlist：
  - `https://fonts.googleapis.com/*`
  - `https://fonts.gstatic.com/*`
- 这些域名只用于加载字体 CSS 和字体文件，风险可控

*`generate-latex.mjs` 修改：*
- 引擎检测列表增加 `xelatex`：`['tectonic', 'pdflatex', 'xelatex']`
- 编译前读取 `.tex` 文件内容，检测 `% !TeX program = xelatex` 声明
- 如果检测到该声明：
  - 优先选择 `xelatex` 引擎（覆盖默认的 `tectonic` 优先）
  - 如果 `xelatex` 未安装，报错（因为 pdflatex 无法编译 xeCJK）
- `xelatex` 编译参数与 `pdflatex` 相同（`-no-shell-escape`, `-interaction=nonstopmode`, `-halt-on-error`），执行两遍以解析交叉引用
- tectonic 对中文的支持不确定（可能缺少 ctex 宏包），因此中文模板强制使用 xelatex

**Patterns to follow:**
- `generate-pdf.mjs` 现有 route handler 模式
- `generate-latex.mjs` 现有引擎检测和编译逻辑

**Test scenarios:**
- Happy path (HTML): `generate-pdf.mjs` 渲染含 Google Fonts CDN 引用的 HTML，字体成功加载
- Happy path (LaTeX): `generate-latex.mjs` 编译含 `% !TeX program = xelatex` 的 .tex 文件，使用 xelatex 成功输出 PDF
- Edge case (LaTeX): 英文 .tex 文件无 xelatex 声明，继续使用 tectonic/pdflatex，行为不变
- Error path (LaTeX): 中文 .tex 需要 xelatex 但系统未安装，给出明确错误信息

**Verification:**
- 英文 CV 生成流程完全不受影响
- 中文 HTML CV 能在 Playwright 中正确加载 Noto Sans SC
- 中文 LaTeX CV 能被 xelatex 正确编译

---

### U4. ATS 自检工具

**Goal:** 创建 `pdftotext` 驱动的 PDF ATS 自检脚本，验证中文文本提取顺序和可读性。

**Requirements:** R9, R10, R11, R12

**Dependencies:** None（独立工具，不依赖生成器修改）

**Files:**
- Create: `tests/cv-ats-selftest.mjs`

**Approach:**
- CLI 接口：`node tests/cv-ats-selftest.mjs <pdf-path> [options]`
- 选项：`--fields` 自定义要验证的字段（默认：姓名、电话、邮箱、教育、工作经历）
- 选项：`--lang=zh-cn` 启用中文特定检查
- 自检流程：
  1. 检查 `pdftotext` 是否安装（`pdftotext -v`），未安装则输出 warn 并 exit 0
  2. 执行 `pdftotext -layout <pdf-path> -` 提取文本
  3. 字段存在性检查：正则匹配每个字段
  4. 字段顺序检查：记录每个匹配在文本中的索引，验证是否按预期顺序递增
  5. 中文可读性检查：
     - 无 `�`（Unicode replacement character）
     - 无连续 `□` 或 `■`（方块字符，表示字体缺失）
     - 无异常乱码模式（如连续的 `\x00-\x1F` 控制字符）
  6. 输出 JSON 格式的自检报告
- 中文特定处理：
  - 姓名字段：通过 `--name` 参数传入
  - 电话正则：支持中国手机号格式（`+86` 可选）
  - 教育关键词：`大学|学院|教育|本科|硕士|博士`
  - 工作经历关键词：`工作|经验|经历|职位|公司`

**Patterns to follow:**
- `test-all.mjs` 的 Node.js ESM 脚本模式
- JSON 输出报告格式（类似 `generate-latex.mjs` 的 report 对象）

**Test scenarios:**
- Happy path: 有效中文 PDF，所有字段按序出现，中文可读 → `passed: true`, exit 0
- Happy path: 有效英文 PDF → `passed: true`, exit 0（兼容）
- Edge case: `pdftotext` 未安装 → `warnings: ["pdftotext not found"]`, exit 0
- Error path: 字段缺失 → `passed: false`, exit 1
- Error path: 字段乱序 → `passed: false`, exit 1
- Error path: 中文包含 `�` → `passed: false`, exit 1
- Error path: 命令行参数缺失 → 输出 usage, exit 1

**Verification:**
- 脚本可独立运行：`node tests/cv-ats-selftest.mjs tests/fixtures/canary-cv.cn.pdf`
- 对有效 PDF 返回 `passed: true`
- 对乱序/乱码 PDF 返回 `passed: false`
- `pdftotext` 缺失时 exit 0 不报错

---

### U5. CI 集成与金丝雀 CV

**Goal:** 将全链路验证（模板渲染 → PDF 生成 → ATS 自检）集成到 `test-all.mjs`。

**Requirements:** R13, R14

**Dependencies:** U1, U2, U3, U4

**Files:**
- Modify: `test-all.mjs`
- Create: `tests/fixtures/canary-cv.cn.html`

**Approach:**

*`tests/fixtures/canary-cv.cn.html`：*
- 基于 `cv-template.cn.html` 结构，填充标准中文简历内容
- 内容包含：姓名（张伟）、电话（+86-138-0013-8000）、邮箱（zhangwei@example.com）、地点（上海，中国）、个人总结、工作经历（2 段，全部中文）、教育（清华大学，计算机科学）、技能列表
- 所有占位符已替换为实际内容，可直接被 `generate-pdf.mjs` 渲染

*`test-all.mjs` 新增 Section 10：*
- 检测 Playwright 是否可用，未安装则跳过 section（参考 Section 4 Dashboard 的跳过模式）
- 检测 `pdftotext` 是否安装，未安装则跳过
- 调用 `generate-pdf.mjs` 将金丝雀 HTML 渲染为临时 PDF
- 调用 `tests/cv-ats-selftest.mjs` 验证该 PDF
- 测试后清理生成的临时 PDF，不提交到仓库

**Patterns to follow:**
- `test-all.mjs` Section 4（Dashboard build）的跳过逻辑
- `test-all.mjs` 的 pass/fail/warn 输出风格

**Test scenarios:**
- Happy path: Playwright + pdftotext 均安装 → 生成 PDF → 自检通过
- Edge case: Playwright 未安装 → 跳过 section，不影响其他测试
- Edge case: pdftotext 未安装 → 跳过 section
- Error path: PDF 生成失败 → section 失败，不影响其他测试
- Error path: ATS 自检失败 → section 失败

**Verification:**
- `node test-all.mjs` 全量通过（新增 section 无失败）
- 在缺少 Playwright/pdftotext 的环境仍能通过（跳过而非失败）
- 英文用户运行 `test-all.mjs` 不受影响

---

## System-Wide Impact

- **Unchanged invariants:**
  - `generate-pdf.mjs` 的英文 CV 渲染流程完全不变
  - `generate-latex.mjs` 的英文 CV 编译流程完全不变（tectonic/pdflatex 优先级不变，仅增加 xelatex 选项）
  - `test-all.mjs` 的 Section 1-9 完全不变
- **Interaction graph:**
  - `generate-pdf.mjs` 的 route handler 增加 Google Fonts CDN allowlist，仅影响含该 CDN 引用的 HTML（即中文模板）
  - `generate-latex.mjs` 的引擎选择逻辑增加 `% !TeX program = xelatex` 检测，仅影响含该声明的 .tex 文件
- **API surface parity:** 无 API 变更。所有变更均为 CLI 脚本行为扩展。

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Google Fonts CDN 在国内/CI 网络不可用 | 金丝雀测试在 Playwright 不可用时跳过；实现时考虑 CSS 内联降级方案 |
| xelatex 未安装导致中文 LaTeX 编译失败 | `generate-latex.mjs` 给出明确错误信息；README 中注明依赖 |
| ctex 宏包在 tectonic 中不可用 | 中文模板强制 xelatex，tectonic 不用于中文编译 |
| `pdftotext` 在不同系统上输出格式差异 | 自检脚本的正则保持宽松；主要验证字段存在性和顺序而非精确文本 |
| 金丝雀 CV fixture 体积 | HTML fixture 为纯文本（~10KB），不提交生成的 PDF |

---

## Documentation / Operational Notes

- `templates/cv-template.cn.html` 和 `templates/cv-template.cn.tex` 创建后，需要在 `modes/zh-cn/` 的文档中提及（如 `modes/zh-cn/README.md` 的已翻译文件清单中追加，或更新 `modes/zh-cn/pdf.md` 如存在）
- 用户首次使用中文模板时，agent 应提示：`config/profile.yml` 中设置 `language.primary: zh-cn` 或会话中显式指定 `--lang zh-cn`

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-08-cjk-cv-ats-selftest-requirements.md](../brainstorms/2026-05-08-cjk-cv-ats-selftest-requirements.md)
- Related code: `templates/cv-template.html`, `templates/cv-template.tex`, `generate-pdf.mjs`, `generate-latex.mjs`, `test-all.mjs`
- Related test: `test-all.mjs` (Section 1-9)
