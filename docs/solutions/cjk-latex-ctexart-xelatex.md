---
title: CJK CV 的 ctexart + xelatex 字体栈方案
type: solution
module: cv-generation
tags: [cjk, latex, xelatex, ctex, font, i18n]
problem_type: 中文 CV 在标准 LaTeX 下字体缺失、编译失败或显示异常
origin: PR #20, templates/cv-template.cn.tex, generate-latex.mjs
---

## 问题

标准 LaTeX（pdflatex）对中文支持极差：
- 默认不支持 UTF-8 中文输入
- 无中文字体配置，编译后全部显示为空白或乱码
- CJK 宏包配置繁琐，不同平台字体路径差异大

## 决策

采用 `ctexart` 文档类 + `xelatex` 编译器，利用 ctex 宏包集成的自动字体探测和系统字体 fallback。

## 实现要点

### 文档类声明

```tex
\documentclass[letterpaper,11pt,UTF8]{ctexart}
```

- `UTF8` 选项启用 UTF-8 编码支持
- `ctexart` 继承自 `article`，但重定义了章节标题、段落缩进等中文排版习惯

### 字体策略

ctex 自动探测系统已安装字体（优先级）：
1. Windows：中易字体（SimSun/SimHei）
2. macOS：华文字体（STSong/STHeiti）
3. Linux：Fandol 或 Noto CJK

无需手动配置 `\setCJKmainfont`，跨平台可移植性最佳。

### 编译链

`generate-latex.mjs` 自动选择编译器：

```js
const compiler = process.platform === 'darwin' || process.platform === 'linux'
  ? 'xelatex'
  : 'pdflatex'; // fallback，但中文场景通常失败
```

### 与 xeCJK 的关系

ctex 底层封装了 xeCJK，但直接使用 ctex 更简洁：
- ctex = 文档类 + 排版习惯 + xeCJK 字体管理
- 若需更精细的字体控制，可降级到 `\documentclass{article}` + `\usepackage{xeCJK}` + 手动 `\setCJKmainfont`

## 已知限制

- 需要系统安装中文字体（CI 中需 `fonts-noto-cjk` 或类似包）
- `fontawesome` 宏包与 ctex 兼容良好，但需确保字体文件存在

## 相关文件

- `templates/cv-template.cn.tex` — CJK LaTeX 模板
- `generate-latex.mjs` — 编译器选择和调用逻辑