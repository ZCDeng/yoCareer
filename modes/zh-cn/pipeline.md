# 模式：pipeline — URL 收件箱（第二大脑）

处理累积在 `data/pipeline.md` 中的职位 URL。用户随时添加 URL，随后执行 `/yoCareer pipeline` 批量处理。

## 工作流

1. **读取** `data/pipeline.md` → 在 "待处理" 区块中查找 `- [ ]` 条目
2. **对每个待处理 URL**：
   a. 计算下一个顺序 `REPORT_NUM`（读取 `reports/`，取最大编号 + 1）
   b. **提取 JD**：使用 Playwright（browser_navigate + browser_snapshot）→ WebFetch → WebSearch
   c. 如 URL 无法访问 → 标记为 `- [!]` 并附备注，继续下一个
   d. **执行完整 auto-pipeline**：评估 A-F → 生成报告 .md → PDF（评分 >= 3.0 时）→ 写入 tracker
   e. **从"待处理"移至"已处理"**：`- [x] #NNN | URL | 公司 | 职位 | 评分/5 | PDF ✅/❌`
3. **如有 3 个以上待处理 URL**，通过宿主 CLI 的子代理并行启动（如 Claude Code 的 `Agent` / `Task`，Codex 的 `spawn_agent`）以最大化速度。
4. **完成后**，展示汇总表格：

```
| # | 公司 | 职位 | 评分 | PDF | 建议动作 |
```

## pipeline.md 格式

```markdown
## 待处理
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — 错误：需要登录

## 已处理
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

## 从 URL 智能提取 JD

1. **Playwright（首选）：** `browser_navigate` + `browser_snapshot`。适用于所有 SPA。
2. **WebFetch（降级）：** 用于静态页面或 Playwright 不可用时。
3. **WebSearch（最后手段）：** 在索引该 JD 的次要平台中搜索。

**特殊情况：**
- **LinkedIn**：可能需要登录 → 标记 `[!]` 并请用户粘贴文本
- **PDF**：如 URL 指向 PDF，直接用 Read 工具读取
- **`local:` 前缀**：读取本地文件。示例：`local:jds/linkedin-pm-ai.md` → 读取 `jds/linkedin-pm-ai.md`

## 自动编号

1. 列出 `reports/` 中的所有文件
2. 提取前缀编号（如 `142-medispend...` → 142）
3. 新编号 = 最大发现值 + 1

## 来源同步检查

处理任何 URL 前，先检查同步状态：
```bash
node cv-sync-check.mjs
```
如存在不同步，在继续前提示用户。
