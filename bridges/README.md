# Reach Bridge Contracts

yoCareer treats Reach/Seek as optional local bridges. Scanner scripts call shell commands and parse JSON output.

## 1) URL Bridge

Environment variable:

```bash
YOCAREER_REACH_READ_URL_CMD="./bridges/reach-read-url.example.sh"
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
YOCAREER_REACH_SIGNAL_SEARCH_CMD="./bridges/reach-signal-search.example.sh"
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
npm run scan -- --dry-run
```

If a bridge is misconfigured, scanner output should report an explicit `skipped` reason instead of failing silently.
