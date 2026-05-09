// yoCareer v2 — Extension popup UI

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const authSection = document.getElementById('auth-section');
  const mainSection = document.getElementById('main-section');
  const btnPairToggle = document.getElementById('btn-pair-toggle');
  const pairingForm = document.getElementById('pairing-form');
  const btnPair = document.getElementById('btn-pair');
  const pairingCode = document.getElementById('pairing-code');
  const pairingMsg = document.getElementById('pairing-message');
  const btnSave = document.getElementById('btn-save');
  const saveMsg = document.getElementById('save-message');

  // ── Check daemon status ──
  const daemonStatus = await chrome.runtime.sendMessage({ type: 'get_daemon_status' });
  if (!daemonStatus.ok) {
    statusDot.className = 'status-dot error';
    statusText.textContent = 'Daemon not running. Run: npx yocareer daemon start';
    return;
  }
  statusDot.className = 'status-dot ok';
  statusText.textContent = `Daemon v${daemonStatus.version} on port ${daemonStatus.port}`;

  // ── Check auth ──
  const auth = await chrome.runtime.sendMessage({ type: 'check_auth' });
  if (!auth.authenticated) {
    authSection.style.display = 'block';
    return;
  }

  mainSection.style.display = 'block';

  // ── Extract page info ──
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const platform = detectPlatform(tab.url);
  document.getElementById('platform-name').textContent = platform || 'Unknown';

  // Try to extract company/role from page (best effort)
  let extracted = null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: quickExtract,
    });
    extracted = results[0]?.result;
  } catch {}

  if (extracted) {
    document.getElementById('company-name').textContent = extracted.company || '?';
    document.getElementById('role-name').textContent = extracted.role || '?';
  }

  // ── Save button ──
  btnSave.addEventListener('click', async () => {
    btnSave.disabled = true;
    saveMsg.textContent = '';

    const payload = {
      url: tab.url,
      title: tab.title || '',
      company_name: extracted?.company || '',
      role: extracted?.role || '',
      source_platform: platform || 'unknown',
    };

    const res = await chrome.runtime.sendMessage({
      type: 'save_signal',
      payload,
    });

    if (res.ok) {
      saveMsg.className = 'message success';
      saveMsg.textContent = 'Saved!';
    } else {
      saveMsg.className = 'message error';
      saveMsg.textContent = res.error || 'Save failed';
    }
    btnSave.disabled = false;
  });

  // ── Pairing UI ──
  btnPairToggle.addEventListener('click', () => {
    pairingForm.classList.toggle('active');
  });

  btnPair.addEventListener('click', async () => {
    const code = pairingCode.value.trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      pairingMsg.className = 'message error';
      pairingMsg.textContent = 'Enter 6-digit code';
      return;
    }
    btnPair.disabled = true;
    const res = await chrome.runtime.sendMessage({ type: 'pair', code });
    if (res.ok) {
      pairingMsg.className = 'message success';
      pairingMsg.textContent = 'Paired! Reloading...';
      setTimeout(() => window.location.reload(), 800);
    } else {
      pairingMsg.className = 'message error';
      pairingMsg.textContent = res.error || 'Pairing failed';
      btnPair.disabled = false;
    }
  });
});

function detectPlatform(url) {
  if (!url) return null;
  if (url.includes('zhipin.com')) return 'BOSS直聘';
  if (url.includes('lagou.com')) return '拉勾';
  if (url.includes('zhaopin.com')) return '智联招聘';
  return null;
}

function quickExtract() {
  // Minimal DOM extraction — runs in page context
  const company = document.querySelector('[class*="company"], [class*="firm"]')?.textContent?.trim()
    || document.querySelector('h1')?.textContent?.split(/[-|]/)[0]?.trim();
  const role = document.querySelector('[class*="job-title"], [class*="position"]')?.textContent?.trim()
    || document.querySelector('h1')?.textContent?.split(/[-|]/)[1]?.trim();
  return { company, role };
}
