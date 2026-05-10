---
title: ATS 兼容性的 pdftotext 往返自检
type: solution
module: cv-generation
tags: [ats, pdf, pdftotext, hiring, accessibility]
problem_type: 生成的 PDF 无法被 ATS（申请追踪系统）正确解析
origin: PR #20/#25, tests/cv-ats-selftest.mjs, templates/cv-template.cn.{html,tex}
---

## 问题

 fancy 排版的 CV PDF 常在 ATS 解析时产生以下问题：
- 文本提取顺序错乱（header 和 body 混排）
- 中文字体缺失导致出现 box 字符（□）
- 关键字段（姓名、电话、邮箱、教育、工作经历）无法提取

## 决策

在 CV 生成流程中嵌入 `pdftotext -layout` 往返测试：生成 PDF → 提取纯文本 → 验证字段存在性和顺序。

## 实现要点

### 字段提取策略

分语言定义关键字段正则：

```js
const DEFAULT_FIELDS_ZH = {
  name: { required: true, source: 'arg' },
  phone: { required: true, pattern: /(?:\+86[\s\-]?)?1[3-9]\d{9}/ },
  email: { required: true, pattern: /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/ },
  education: { required: true, pattern: /大学|学院|本科|硕士|博士/ },
  experience: { required: true, pattern: /工作|经验|经历|职位|公司/ },
};
```

### 顺序检查（header-fixed / body-flexible）

- **Header 固定**：姓名必须出现在文档前 30% 区域内
- **Body 灵活**：教育、工作经历只需存在，不强制顺序（适应不同模板排列）
- 替代了早期的 `checkFieldOrder` 同义反复检查（PR #23），真正能捕捉 sidebar 拆分/头部错位

### 缺失工具处理

```js
if (!checkPdftotext()) {
  report.warnings.push('pdftotext not found — skipping ATS self-test');
  console.log(JSON.stringify(report));
  process.exit(0); // 不阻塞 CI，但标记为未验证
}
```

### 负向 fixture

`--expect-fail` 参数支持负向测试：故意生成有问题的 PDF，验证 selftest 能正确识别并失败。

## CI 集成

`.github/workflows/test.yml` 安装 `poppler-utils`，Section 11 在 CI 模式下 hard-fail（PR #25 后不再 silent skip）。

## 相关文件

- `tests/cv-ats-selftest.mjs` — 自检脚本
- `templates/cv-template.cn.html` — CJK HTML 模板
- `templates/cv-template.cn.tex` — CJK LaTeX 模板（`ctexart` + `xelatex`）