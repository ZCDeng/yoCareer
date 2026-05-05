# Reach Bridge Contracts

yoCareer treats Reach/Seek as optional local bridges. Scanner scripts call shell commands and parse JSON output.

Built-in default bridges:

- `./bridges/reach-read-url.mjs` (public URL extraction)
- `./bridges/reach-signal-search.mjs` (platform+query search)

If these files exist, scanner scripts use them automatically even when env vars are not set.

## 1) URL Bridge

Environment variable:

```bash
YOCAREER_REACH_READ_URL_CMD="./bridges/reach-read-url.mjs"
```

Command contract:

- Input args: `<url>`
- Output: JSON object or array containing `signals`

Minimal output shape:

```json
{
  "signals": [
    {
      "kind": "official_job",
      "company": "ExampleCorp",
      "title": "大模型平台工程师",
      "url": "https://example.com/jobs/123",
      "confidence": 0.8,
      "source_platform": "reach_read_url",
      "recommended_action": "apply_on_official_site"
    }
  ]
}
```

## 2) Signal Search Bridge

Environment variable:

```bash
YOCAREER_REACH_SIGNAL_SEARCH_CMD="./bridges/reach-signal-search.mjs"
```

Command contract:

- Input args: `<platform> <query>`
- Output: JSON object or array containing `signals`

Minimal output shape:

```json
{
  "signals": [
    {
      "kind": "recruiter_post",
      "company": "ExampleCorp",
      "title": "招聘大模型算法工程师",
      "url": "https://example.com/post/abc",
      "confidence": 0.84,
      "source_platform": "weibo",
      "recommended_action": "message_recruiter",
      "evidence_text": "团队扩招，岗位职责包含..."
    }
  ]
}
```

## Validation

```bash
npm run providers
npm run bridge:smoke
npm run scan -- --dry-run
```

If a bridge is misconfigured, scanner output should report an explicit `skipped` reason instead of failing silently.

## Notes on the Built-in Default

- `reach-signal-search.mjs` currently supports:
  - `x` / `twitter` via `xreach`
  - `v2ex` via public V2EX API
  - `github` via `gh search issues`
- `reach-read-url.mjs` supports:
  - `x` status URLs via `xreach tweet`
  - generic public URLs via `r.jina.ai/<url>`

For Weibo/Xiaohongshu/WeChat and other login-gated channels, keep using user-provided exports or replace default scripts with your own local bridge command.
