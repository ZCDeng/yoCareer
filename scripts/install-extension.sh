#!/usr/bin/env bash
# yoCareer Extension Installer
# One-liner: curl -fsSL .../install-extension.sh | bash
set -euo pipefail

REPO="ZCDeng/yoCareer"
INSTALL_DIR="${HOME}/.yocareer/extension"

# ── Colors ──────────────────────────────────────────────────────────
red='\033[0;31m'
green='\033[0;32m'
yellow='\033[1;33m'
blue='\033[0;34m'
reset='\033[0m'

info()  { printf "${blue}→${reset} %s\n" "$*"; }
ok()    { printf "${green}✓${reset} %s\n" "$*"; }
warn()  { printf "${yellow}!${reset} %s\n" "$*"; }
err()   { printf "${red}✗${reset} %s\n" "$*"; }

# ── Detect source ───────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -d "${SCRIPT_DIR}/../extension" && -f "${SCRIPT_DIR}/../extension/manifest.json" ]]; then
  # Running from cloned repo
  SRC_DIR="$(cd "${SCRIPT_DIR}/../extension" && pwd)"
  info "Using local extension/ directory: ${SRC_DIR}"
else
  # Download from GitHub Release
  info "Fetching latest release..."
  LATEST_URL=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"browser_download_url".*extension.*\.zip' \
    | head -1 \
    | sed -E 's/.*"([^"]+)".*/\1/')

  if [[ -z "${LATEST_URL:-}" ]]; then
    # Fallback: no release asset found; try raw zip from main branch
    warn "No release asset found. Downloading extension/ from main branch..."
    TMP_DIR=$(mktemp -d)
    curl -fsSL "https://github.com/${REPO}/archive/refs/heads/main.zip" -o "${TMP_DIR}/yoCareer.zip"
    unzip -q "${TMP_DIR}/yoCareer.zip" -d "${TMP_DIR}"
    SRC_DIR="${TMP_DIR}/yoCareer-main/extension"
  else
    TMP_DIR=$(mktemp -d)
    curl -fsSL "${LATEST_URL}" -o "${TMP_DIR}/extension.zip"
    unzip -q "${TMP_DIR}/extension.zip" -d "${TMP_DIR}"
    SRC_DIR="${TMP_DIR}/extension"
  fi
fi

# ── Install ─────────────────────────────────────────────────────────
info "Installing to ${INSTALL_DIR}..."
rm -rf "${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
cp -R "${SRC_DIR}/." "${INSTALL_DIR}/"
ok "Extension installed to ${INSTALL_DIR}"

# ── Print browser-specific instructions ─────────────────────────────
echo ""
echo "───────────────────────────────────────────────────────────────────"
echo "  浏览器扩展安装完成。请按以下步骤加载："
echo "───────────────────────────────────────────────────────────────────"
echo ""

# Detect browser
if [[ "$OSTYPE" == "darwin"* ]]; then
  BROWSER_DIR="${HOME}/Library/Application Support"
  CHROME_EXT="Google/Chrome/Default/Extensions"
  EDGE_EXT="Microsoft Edge/Default/Extensions"
  echo "  ${green}Chrome${reset}:"
  echo "    1. 打开 chrome://extensions"
  echo "    2. 开启「开发者模式」（右上角开关）"
  echo "    3. 点击「加载已解压的扩展程序」"
  echo "    4. 选择: ${INSTALL_DIR}"
  echo ""
  echo "  ${green}Edge${reset}:"
  echo "    1. 打开 edge://extensions"
  echo "    2. 开启「开发人员模式」（左下角开关）"
  echo "    3. 点击「加载解压缩的扩展」"
  echo "    4. 选择: ${INSTALL_DIR}"
  echo ""
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  echo "  ${green}Chrome${reset}:"
  echo "    1. 打开 chrome://extensions"
  echo "    2. 开启「开发者模式」（右上角开关）"
  echo "    3. 点击「加载已解压的扩展程序」"
  echo "    4. 选择: ${INSTALL_DIR}"
  echo ""
  echo "  ${green}Edge${reset}:"
  echo "    1. 打开 edge://extensions"
  echo "    2. 开启「开发人员模式」（左下角开关）"
  echo "    3. 点击「加载解压缩的扩展」"
  echo "    4. 选择: ${INSTALL_DIR}"
  echo ""
else
  echo "  ${green}Chrome${reset}: chrome://extensions → 开发者模式 → 加载已解压 → ${INSTALL_DIR}"
  echo "  ${green}Edge${reset}:   edge://extensions → 开发人员模式 → 加载解压缩 → ${INSTALL_DIR}"
  echo ""
fi

echo "  ${yellow}首次使用需配对：${reset}"
echo "    1. 确保 daemon 正在运行（npm run daemon）"
echo "    2. 在 BOSS直聘 / 拉勾 / 智联页面点击扩展图标"
echo "    3. 弹出面板输入 6 位配对码 → 自动注册"
echo ""
echo "───────────────────────────────────────────────────────────────────"
