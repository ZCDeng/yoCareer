---
title: CI 中缺失外部工具时的 graceful skip 模式
type: solution
module: testing
tags: [ci, testing, pdftotext, skip, graceful-degradation]
problem_type: 外部依赖（如 pdftotext）在 CI 中未安装导致测试失败，但测试本身非核心
origin: PR #20/#25, tests/cv-ats-selftest.mjs, .github/workflows/test.yml
---

## 问题

部分测试依赖外部二进制工具（如 `pdftotext` from poppler-utils）：
- 本地开发环境可能未安装
- CI runner 默认镜像可能未包含
- 直接失败会阻塞不相关的代码变更

## 决策

采用"检测 → warn → skip → exit 0"的 graceful 降级模式，同时在 CI workflow 中显式安装工具以覆盖核心路径。

## 实现要点

### 检测模式

```js
function checkPdftotext() {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
```

### Skip 逻辑

```js
if (!checkPdftotext()) {
  report.warnings.push('pdftotext not found — skipping ATS self-test');
  console.log(JSON.stringify(report));
  process.exit(0); // 不失败，但输出明确标记
}
```

关键设计：
- **exit 0 而非 1**：不阻塞 CI pipeline，避免"伪失败"
- **JSON 报告到 stdout**：调用方（如 test-all.mjs）可解析 `warnings` 数组，在汇总报告中标记"未验证"
- **明确标记**：warning 信息包含工具名和操作（"skipping ATS self-test"），日志可搜索

### CI 中的 hard-fail

`.github/workflows/test.yml` 显式安装工具：

```yaml
- name: Install poppler-utils (pdftotext for ATS selftest)
  run: sudo apt-get update && sudo apt-get install -y poppler-utils
```

安装后 selftest 会实际运行，CI 中该测试从 "skip" 升级为 "hard-fail"（PR #25）。

## 适用边界

| 场景 | 策略 |
|------|------|
| 本地开发，工具未装 | skip，不阻塞 |
| CI，工具已装 | 正常执行，失败即真失败 |
| CI，工具安装失败 | 降级为 skip，不阻塞整个 CI（安装步骤独立） |

## 反模式：避免滥用

- **不要**对核心功能测试使用 skip（如单元测试、API 契约测试）
- **不要**静默 skip（必须输出 warning 到 stdout）
- **不要**用环境变量 hack（如 `SKIP_ATS_TEST=1`），工具存在性检测更自文档化

## 相关文件

- `tests/cv-ats-selftest.mjs:46-48,186-189` — 检测和 skip 逻辑
- `.github/workflows/test.yml:18-19` — CI 工具安装