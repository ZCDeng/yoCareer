---
title: URL 白名单必须使用 hostname 精确匹配而非 startsWith
type: solution
module: security
tags: [url-validation, allowlist, ssrf, codeql]
problem_type: 不完整的 URL 子串校验导致绕过
origin: PR #20, generate-pdf.mjs:106-114
---

## 问题

Playwright 生成 PDF 时允许加载外部字体（Google Fonts CDN）。早期实现用 `startsWith('https://fonts.googleapis.com')` 做白名单校验，存在明显的子域绕过：`https://fonts.googleapis.com.evil.com` 会匹配成功。

## 决策

改用 `new URL()` 解析后做 `hostname ===` 精确匹配，并限定 `protocol === 'https:'`。

## 实现要点

```js
export function isFontsAllowlistUrl(requestUrl) {
  try {
    const u = new URL(requestUrl);
    return u.protocol === 'https:'
      && (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com');
  } catch {
    return false;
  }
}
```

防御面覆盖：
- 子域注入：`fonts.googleapis.com.evil.com` → hostname 不匹配
- userinfo 注入：`fonts.googleapis.com@evil.com` → URL 解析后 hostname 为 `evil.com`
- 路径/查询注入：`evil.com/?@fonts.googleapis.com` → hostname 为 `evil.com`
- 协议降级：`http://` / `ftp://` → 被 protocol 检查拦截
- 大小写变体：`FONTS.GOOGLEAPIS.COM` → URL 解析自动 lowercase，仍匹配
- 非法 URL → `catch` 返回 `false`

## 回归测试

`tests/url-allowlist-selftest.mjs` 含 18 个 case，覆盖上述全部绕过向量 + `canLoadRequest` 的 `file://` 路径遍历。CI 中 hard-fail。

## 相关文件

- `generate-pdf.mjs:106-114` — 白名单实现
- `tests/url-allowlist-selftest.mjs` — 回归测试