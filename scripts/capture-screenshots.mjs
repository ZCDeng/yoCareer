#!/usr/bin/env node
/**
 * Capture store screenshots for the yoCareer extension.
 * Generates 1280x800 screenshots showing the popup in various states.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';

const OUT_DIR = 'store-assets/screenshots';

async function capturePopupState(page, state, filename) {
  // Inject popup HTML into a clean page
  const popupHtml = readFileSync('extension/popup/popup.html', 'utf8');
  
  // Modify the HTML to show the desired state
  let modified = popupHtml;
  
  if (state === 'pairing') {
    modified = modified
      .replace('id="auth-section" class="section" style="display: none;"', 'id="auth-section" class="section" style="display: block;"')
      .replace('id="main-section" class="section" style="display: block;"', 'id="main-section" class="section" style="display: none;"')
      .replace('Checking daemon...', 'Daemon connected — pairing required')
      .replace('id="status-dot"', 'id="status-dot" class="ok"');
  } else if (state === 'connected') {
    modified = modified
      .replace('id="auth-section" class="section" style="display: block;"', 'id="auth-section" class="section" style="display: none;"')
      .replace('id="main-section" class="section" style="display: none;"', 'id="main-section" class="section" style="display: block;"')
      .replace('Checking daemon...', 'Connected to daemon')
      .replace('id="status-dot"', 'id="status-dot" class="ok"')
      .replace('id="platform-name">-', 'id="platform-name">BOSS直聘')
      .replace('id="company-name">-', 'id="company-name">字节跳动')
      .replace('id="role-name">-', 'id="role-name">高级后端工程师');
  } else if (state === 'saving') {
    modified = modified
      .replace('id="auth-section" class="section" style="display: block;"', 'id="auth-section" class="section" style="display: none;"')
      .replace('id="main-section" class="section" style="display: none;"', 'id="main-section" class="section" style="display: block;"')
      .replace('Checking daemon...', 'Connected to daemon')
      .replace('id="status-dot"', 'id="status-dot" class="ok"')
      .replace('id="platform-name">-', 'id="platform-name">拉勾网')
      .replace('id="company-name">-', 'id="company-name">美团')
      .replace('id="role-name">-', 'id="role-name">AI 产品经理')
      .replace('Save to yoCareer', 'Saved ✓');
  }
  
  await page.setContent(modified, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(OUT_DIR, filename), type: 'png' });
  console.log(`✓ ${filename}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

console.log('Capturing screenshots...');
await capturePopupState(page, 'pairing', '01-pairing.png');
await capturePopupState(page, 'connected', '02-connected.png');
await capturePopupState(page, 'saving', '03-saved.png');

await browser.close();
console.log(`Done. Screenshots saved to ${OUT_DIR}/`);
