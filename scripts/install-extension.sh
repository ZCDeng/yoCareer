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
# NOTE: use printf for any line containing ${green}/${yellow}/${reset};
# bash's builtin `echo` does not interpret \033 escapes by default and
# would print them as literal text.
printf "\n"
printf "───────────────────────────────────────────────────────────────────\n"
printf "  浏览器扩展安装完成。请按以下步骤加载：\n"
printf "───────────────────────────────────────────────────────────────────\n\n"

print_browser_block() {
  local browser="$1" url="$2" devmode="$3" load="$4"
  printf "  ${green}%s${reset}:\n" "$browser"
  printf "    1. 打开 %s\n" "$url"
  printf "    2. 开启「%s」\n" "$devmode"
  printf "    3. 点击「%s」\n" "$load"
  printf "    4. 选择: %s\n\n" "$INSTALL_DIR"
}

if [[ "$OSTYPE" == "darwin"* || "$OSTYPE" == "linux-gnu"* ]]; then
  print_browser_block "Chrome" "chrome://extensions" "开发者模式（右上角开关）" "加载已解压的扩展程序"
  print_browser_block "Edge"   "edge://extensions"   "开发人员模式（左下角开关）" "加载解压缩的扩展"
else
  printf "  ${green}Chrome${reset}: chrome://extensions → 开发者模式 → 加载已解压 → %s\n" "$INSTALL_DIR"
  printf "  ${green}Edge${reset}:   edge://extensions → 开发人员模式 → 加载解压缩 → %s\n\n" "$INSTALL_DIR"
fi

printf "  ${yellow}首次使用需配对：${reset}\n"
printf "    1. 确保 daemon 正在运行（npm run daemon）\n"
printf "    2. 在 BOSS直聘 / 拉勾 / 智联页面点击扩展图标\n"
printf "    3. 弹出面板输入 6 位配对码 → 自动注册\n\n"
printf "───────────────────────────────────────────────────────────────────\n"
