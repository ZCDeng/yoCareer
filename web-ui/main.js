// yoCareer web-ui — vanilla JS, no framework, no build step.
// Loaded by index.html as a plain script.

const sidebar = document.getElementById('sidebar');
const viewer = document.getElementById('viewer');
const metricsEl = document.getElementById('metrics');
const tabs = document.querySelectorAll('.tab');

let state = {
  tab: 'apps',
  apps: [],
  reports: [],
  pdfs: [],
  selected: null,
};

// === Minimal markdown → HTML renderer ===
//
// Covers headings, lists (ul / ol), code blocks, inline code, links, bold,
// italic, blockquotes, hr, and pipe tables. Not a full CommonMark parser —
// CV reports / applications.md tables / pipeline.md don't need GFM extensions.
// Outputs are HTML-escaped before formatting characters are processed.
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(text) {
  let s = escapeHtml(text);
  // Stash code-span content in a placeholder so subsequent passes don't see
  // its formatting characters. Use array index — simpler than base64 and
  // avoids the deprecated escape/unescape pair.
  const codeSlots = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codeSlots.push(c); return ` CODE${codeSlots.length - 1} `; });
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, txt, url) => {
    const safe = url.replace(/"/g, '&quot;');
    return `<a href="${safe}" target="_blank" rel="noopener">${txt}</a>`;
  });
  s = s.replace(/ CODE(\d+) /g, (_, idx) => `<code>${codeSlots[Number(idx)]}</code>`);
  return s;
}

function renderMarkdown(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(escapeHtml(lines[i]));
        i++;
      }
      i++;
      out.push(`<pre><code>${buf.join('\n')}</code></pre>`);
      continue;
    }

    // Headings
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Hr
    if (/^---+\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // Pipe table
    if (/^\|.*\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|/.test(lines[i + 1])) {
      const headerCells = line.slice(1, -1).split('|').map(c => c.trim());
      i += 2;
      const bodyRows = [];
      while (i < lines.length && /^\|.*\|/.test(lines[i])) {
        bodyRows.push(lines[i].slice(1, -1).split('|').map(c => c.trim()));
        i++;
      }
      let html = '<table><thead><tr>';
      for (const c of headerCells) html += `<th>${renderInline(c)}</th>`;
      html += '</tr></thead><tbody>';
      for (const row of bodyRows) {
        html += '<tr>';
        for (const c of row) html += `<td>${renderInline(c)}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table>';
      out.push(html);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      out.push('<ul>' + items.map(it => `<li>${renderInline(it)}</li>`).join('') + '</ul>');
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push('<ol>' + items.map(it => `<li>${renderInline(it)}</li>`).join('') + '</ol>');
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderInline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // Blank → paragraph break
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph (consume consecutive non-empty non-special lines)
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#|>|---|```|\s*[-*+]\s|\s*\d+\.\s|\|)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

// === API ===
async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

// === Tab switching ===
function setTab(name) {
  state.tab = name;
  state.selected = null;
  for (const t of tabs) t.classList.toggle('active', t.dataset.tab === name);
  render();
}

for (const t of tabs) {
  t.addEventListener('click', () => setTab(t.dataset.tab));
}

// === Render: sidebar + viewer ===
function row(html, onClick, active) {
  const div = document.createElement('div');
  div.className = 'row' + (active ? ' active' : '');
  div.innerHTML = html;
  div.addEventListener('click', onClick);
  return div;
}

function pill(text, cls = '') {
  return `<span class="pill ${cls}">${escapeHtml(text)}</span>`;
}

async function render() {
  if (state.tab === 'apps') return renderApps();
  if (state.tab === 'reports') return renderReports();
  if (state.tab === 'pipeline') return renderPipeline();
  if (state.tab === 'output') return renderOutput();
}

async function renderApps() {
  sidebar.innerHTML = '<div class="sidebar-section">Applications</div><div class="empty muted" style="padding: 16px">Loading…</div>';
  try {
    const data = await api('/api/applications');
    state.apps = data.apps;
    sidebar.innerHTML = '<div class="sidebar-section">Applications · ' + data.count + '</div>';
    if (data.apps.length === 0) {
      sidebar.innerHTML += '<div class="empty muted" style="padding: 16px; font-size: 12px">No applications yet. Drop a JD into Claude Code or paste a URL into <code>data/pipeline.md</code>.</div>';
      viewer.innerHTML = '<div class="empty">Empty tracker. Run <code>/yoCareer</code> with a JD to evaluate.</div>';
      return;
    }
    for (const app of data.apps) {
      const html = `
        <div class="row-title">
          <span>${escapeHtml(app.company)} · ${escapeHtml(app.role)}</span>
          ${app.score ? pill(app.score, 'score') : ''}
        </div>
        <div class="row-meta">
          ${app.status ? pill(app.status, 'status-' + app.status.replace(/\s+/g, '-')) : ''}
          <span>${escapeHtml(app.date)}</span>
          <span>#${escapeHtml(app.num)}</span>
        </div>`;
      sidebar.appendChild(row(html, () => selectApp(app), state.selected === app.num));
    }
  } catch (err) {
    sidebar.innerHTML = `<div class="empty muted">Failed to load applications: ${escapeHtml(err.message)}</div>`;
  }
}

async function selectApp(app) {
  state.selected = app.num;
  // Re-render sidebar to show active
  for (const r of sidebar.querySelectorAll('.row')) r.classList.remove('active');
  // Find the matching report path from the report cell
  const reportMatch = /reports\/([^)\s]+\.md)/.exec(app.report || '');
  const filename = reportMatch?.[1];
  if (!filename) {
    viewer.innerHTML = `
      <div class="markdown">
        <h1>${escapeHtml(app.company)} · ${escapeHtml(app.role)}</h1>
        <p>${pill(app.status, 'status-' + app.status.replace(/\s+/g, '-'))} ${app.score ? pill(app.score, 'score') : ''} <span class="muted">${escapeHtml(app.date)}</span></p>
        <p class="muted">No linked report file.</p>
        <p>${escapeHtml(app.notes || '')}</p>
      </div>`;
    return;
  }
  await loadAndRenderReport(filename);
}

async function renderReports() {
  sidebar.innerHTML = '<div class="sidebar-section">Reports</div><div class="empty muted" style="padding: 16px">Loading…</div>';
  try {
    const data = await api('/api/reports');
    state.reports = data.reports;
    sidebar.innerHTML = '<div class="sidebar-section">Reports · ' + data.reports.length + '</div>';
    if (data.reports.length === 0) {
      sidebar.innerHTML += '<div class="empty muted" style="padding: 16px; font-size: 12px">No reports yet.</div>';
      viewer.innerHTML = '<div class="empty">Run an evaluation in Claude Code to generate reports.</div>';
      return;
    }
    for (const filename of data.reports) {
      const html = `<div class="row-title"><span>${escapeHtml(filename)}</span></div>`;
      sidebar.appendChild(row(html, () => loadAndRenderReport(filename), state.selected === filename));
    }
  } catch (err) {
    sidebar.innerHTML = `<div class="empty muted">${escapeHtml(err.message)}</div>`;
  }
}

async function loadAndRenderReport(filename) {
  state.selected = filename;
  for (const r of sidebar.querySelectorAll('.row')) r.classList.remove('active');
  try {
    const data = await api('/api/reports/' + encodeURIComponent(filename));
    viewer.innerHTML = `
      <div class="viewer-toolbar">
        <span class="filename">reports/${escapeHtml(filename)}</span>
        <a class="btn" href="/api/reports/${encodeURIComponent(filename)}" target="_blank">raw</a>
      </div>
      <div class="markdown">${renderMarkdown(data.content)}</div>`;
  } catch (err) {
    viewer.innerHTML = `<div class="empty muted">Failed to load: ${escapeHtml(err.message)}</div>`;
  }
}

async function renderPipeline() {
  sidebar.innerHTML = '<div class="sidebar-section">Pipeline</div>';
  try {
    const data = await api('/api/pipeline');
    if (!data.content || !data.content.trim()) {
      sidebar.innerHTML += '<div class="empty muted" style="padding: 16px; font-size: 12px">Empty.</div>';
      viewer.innerHTML = '<div class="empty">Pipeline is empty. Drop URLs into <code>data/pipeline.md</code>.</div>';
      return;
    }
    sidebar.innerHTML += '<div class="empty muted" style="padding: 16px; font-size: 12px">Pipeline shown in main pane.</div>';
    viewer.innerHTML = `
      <div class="viewer-toolbar"><span class="filename">data/pipeline.md</span></div>
      <div class="markdown">${renderMarkdown(data.content)}</div>`;
  } catch (err) {
    sidebar.innerHTML += `<div class="empty muted">${escapeHtml(err.message)}</div>`;
  }
}

async function renderOutput() {
  sidebar.innerHTML = '<div class="sidebar-section">CV PDFs</div>';
  try {
    const data = await api('/api/output');
    state.pdfs = data.files;
    sidebar.innerHTML = `<div class="sidebar-section">CV PDFs · ${data.files.length}</div>`;
    if (data.files.length === 0) {
      sidebar.innerHTML += '<div class="empty muted" style="padding: 16px; font-size: 12px">No CVs generated yet.</div>';
      viewer.innerHTML = '<div class="empty">Run <code>/yoCareer pdf</code> to generate.</div>';
      return;
    }
    for (const f of data.files) {
      const html = `<div class="row-title"><span>${escapeHtml(f)}</span></div>`;
      sidebar.appendChild(row(html, () => previewPdf(f), state.selected === f));
    }
  } catch (err) {
    sidebar.innerHTML += `<div class="empty muted">${escapeHtml(err.message)}</div>`;
  }
}

function previewPdf(filename) {
  state.selected = filename;
  for (const r of sidebar.querySelectorAll('.row')) r.classList.remove('active');
  const url = '/api/output/' + encodeURIComponent(filename);
  viewer.innerHTML = `
    <div class="viewer-toolbar">
      <span class="filename">output/${escapeHtml(filename)}</span>
      <a class="btn" href="${url}" target="_blank">open in tab</a>
    </div>
    <iframe class="pdf-frame" src="${url}" title="${escapeHtml(filename)}"></iframe>`;
}

// === Top metrics ===
async function refreshMetrics() {
  try {
    const m = await api('/api/metrics');
    metricsEl.innerHTML = `
      <div class="metric"><span class="label">Total</span><span class="value">${m.total}</span></div>
      <div class="metric"><span class="label">Interview</span><span class="value">${m.interviews}</span></div>
      <div class="metric"><span class="label">Offer</span><span class="value">${m.offers}</span></div>
      <div class="metric"><span class="label">Avg score</span><span class="value">${m.avg_score || '-'}</span></div>
    `;
  } catch (err) {
    metricsEl.innerHTML = `<span class="muted">${escapeHtml(err.message)}</span>`;
  }
}

// === Boot ===
refreshMetrics();
render();
