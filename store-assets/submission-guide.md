# yoCareer Extension — Store Submission Guide

## Package

- **File**: `store-assets/yoCareer-extension-v2.0.0.zip`
- **Size**: ~18 KB
- **Manifest Version**: 3
- **Version**: 2.0.0

## Stores

### 1. Microsoft Edge Add-ons

**URL**: https://partner.microsoft.com/en-us/dashboard/microsoftedge/

**Requirements**:
- Microsoft 账号
- 扩展包（zip）
- 商店描述（中英文）
- 图标：300x300 推广图（可选但推荐）
- 截图：1280x800 或 640x400，至少 1 张，最多 10 张
- 隐私政策 URL

**Steps**:
1. 登录 [Partner Center](https://partner.microsoft.com/)
2. 创建新扩展 → 上传 zip 包
3. 填写商店列表信息（复制 `description.md` 内容）
4. 上传截图和推广图
5. 填写隐私政策 URL（可指向 GitHub 上的 privacy-policy.md）
6. 提交审核（通常 1-3 个工作日）

**Notes**:
- Edge Add-ons 审核相对宽松
- 需要说明扩展仅访问 localhost（host_permissions）的原因
- 推广图不是必须的，但有的话展示效果更好

---

### 2. 极简插件商店 (ChromeExt.net)

**URL**: https://www.chromeext.net/

**Requirements**:
- 邮箱注册
- 扩展包（zip）
- 中文描述
- 图标：128x128

**Steps**:
1. 注册账号
2. 提交扩展 → 上传 zip
3. 填写名称、描述、版本
4. 等待审核

**Notes**:
- 国内用户友好，无需翻墙
- 适合 yoCareer 的主要用户群体（国内求职者）

---

### 3. Crx搜搜

**URL**: https://www.crxsoso.com/

**Requirements**:
- 邮箱注册
- 扩展包（zip 或 crx）
- 中文描述

**Steps**:
1. 注册账号
2. 上传扩展文件
3. 填写信息
4. 等待审核

---

## Screenshots Needed

| 尺寸 | 内容 | 状态 |
|------|------|------|
| 1280x800 | Popup 配对界面（输入 6 位配对码） | ✅ `01-pairing.png` |
| 1280x800 | Popup 主界面（已配对，显示职位信息） | ✅ `02-connected.png` |
| 1280x800 | 保存成功状态 | ✅ `03-saved.png` |

截图可用 `scripts/capture-screenshots.mjs` 生成（Playwright）。

## Checklist

- [x] 图标已生成（16/48/128 PNG + SVG source）
- [x] 扩展包已打包（zip）
- [x] 商店描述已准备（中英文）
- [x] 隐私政策已准备
- [x] 截图已准备（3 张 1280x800）
- [ ] 推广图已准备（可选）
- [ ] Edge Add-ons 提交
- [ ] 极简插件商店提交
- [ ] Crx搜搜提交
