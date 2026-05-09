// yoCareer v2 — Extension content extractor
//
// Platform-specific selectors for BOSS, Lagou, Zhaopin.
// Runs in page context, sends extracted signal to SW via runtime.sendMessage.

const PLATFORM_SELECTORS = {
  'zhipin.com': {
    company: '.job-sec-text, .company-name, [ka="job-detail-company"]',
    role: '.job-name, .name, h1',
    jd: '.job-sec-text, .job-description, .detail-content',
    salary: '.salary, .num',
    location: '.job-area, .location',
  },
  'lagou.com': {
    company: '.company, .company-name, .job-company',
    role: '.position-name, .name, h1, .job-name',
    jd: '.job-detail, .position-desc, .description',
    salary: '.salary, .salary-text',
    location: '.work-address, .job-address',
  },
  'zhaopin.com': {
    company: '.company-name, .com-name, .org-name',
    role: '.job-name, .position-name, h1',
    jd: '.job-description, .desc-content, .position-desc',
    salary: '.salary, .sala-text',
    location: '.job-address, .address',
  },
};

function detectPlatform() {
  const host = location.hostname;
  if (host.includes('zhipin.com')) return 'zhipin.com';
  if (host.includes('lagou.com')) return 'lagou.com';
  if (host.includes('zhaopin.com')) return 'zhaopin.com';
  return null;
}

function extractText(selectors) {
  if (!selectors) return '';
  const list = typeof selectors === 'string' ? selectors.split(',') : selectors;
  for (const sel of list) {
    const el = document.querySelector(sel.trim());
    if (el) {
      const text = el.textContent.trim();
      if (text) return text;
    }
  }
  return '';
}

function extractJD() {
  const platform = detectPlatform();
  const sels = PLATFORM_SELECTORS[platform];
  if (!sels) return '';
  const el = document.querySelector(sels.jd?.split(',')[0]);
  if (!el) return '';
  // Clean up the JD text
  return el.innerText
    .replace(/\s+/g, ' ')
    .replace(/(查看全部|展开|收起|更多)/g, '')
    .trim()
    .slice(0, 4000);
}

function buildSignal() {
  const platform = detectPlatform();
  if (!platform) return null;
  const sels = PLATFORM_SELECTORS[platform];

  const company = extractText(sels.company);
  const role = extractText(sels.role);
  const salary = extractText(sels.salary);
  const location = extractText(sels.location);
  const jd = extractJD();

  if (!company && !role) return null;

  return {
    url: location.href,
    title: document.title,
    company_name: company,
    role,
    jd_md: jd ? `## ${role} @ ${company}\n\n**Salary:** ${salary}\n**Location:** ${location}\n\n${jd}` : '',
    source_platform: platform,
    payload_json: JSON.stringify({ salary, location }),
  };
}

// ── Report extraction result to popup ──
function reportAvailable() {
  const signal = buildSignal();
  if (signal) {
    chrome.runtime.sendMessage({
      type: 'content_ready',
      payload: signal,
    }).catch(() => {});
  }
}

// Run once on load, and on SPA navigation (BOSS is React-based)
reportAvailable();

// Observe URL changes for SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(reportAvailable, 1500);
  }
}).observe(document, { subtree: true, childList: true });
