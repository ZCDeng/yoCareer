// yoCareer v2 Web UI — Cmd+K palette
//
// Vanilla <dialog> + ARIA combobox pattern + Fuse.js fuzzy match.
// No React, no cmdk dependency.

let fuse = null;
let commands = [];
let selectedIndex = -1;
let onSelectCallback = null;

const dialog = document.createElement('dialog');
dialog.id = 'cmdk-dialog';
dialog.setAttribute('aria-label', 'Command palette');
dialog.innerHTML = `
  <div class="cmdk-overlay"></div>
  <div class="cmdk-container" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-controls="cmdk-list">
    <div class="cmdk-input-wrapper">
      <input
        type="text"
        class="cmdk-input"
        placeholder="Type a command..."
        aria-autocomplete="list"
        aria-controls="cmdk-list"
        aria-activedescendant=""
        autocomplete="off"
        spellcheck="false"
      />
    </div>
    <ul id="cmdk-list" class="cmdk-list" role="listbox"></ul>
    <div class="cmdk-footer">
      <kbd>↑↓</kbd> navigate <kbd>↵</kbd> select <kbd>esc</kbd> close
    </div>
  </div>
`;
document.body.appendChild(dialog);

const input = dialog.querySelector('.cmdk-input');
const list = dialog.querySelector('.cmdk-list');
const container = dialog.querySelector('.cmdk-container');

function registerCommands(cmds) {
  commands = cmds.map((c, i) => ({ ...c, id: `cmd-${i}` }));
  fuse = new Fuse(commands, {
    keys: ['label', 'keywords'],
    threshold: 0.4,
    ignoreLocation: true,
  });
}

function openCmdK(onSelect) {
  onSelectCallback = onSelect;
  selectedIndex = -1;
  input.value = '';
  dialog.showModal();
  input.focus();
  renderList(commands);
  container.setAttribute('aria-expanded', 'true');
}

function closeCmdK() {
  dialog.close();
  container.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-activedescendant', '');
}

function renderList(items) {
  list.innerHTML = '';
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'cmdk-item cmdk-empty';
    li.textContent = 'No results found';
    list.appendChild(li);
    return;
  }

  items.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = 'cmdk-item' + (idx === 0 ? ' selected' : '');
    li.id = item.id;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
    li.innerHTML = `
      <span class="cmdk-item-label">${escapeHtml(item.label)}</span>
      ${item.detail ? `<span class="cmdk-item-detail">${escapeHtml(item.detail)}</span>` : ''}
    `;
    li.addEventListener('click', () => selectItem(item));
    li.addEventListener('mouseenter', () => setSelectedIndex(idx));
    list.appendChild(li);
  });

  selectedIndex = items.length > 0 ? 0 : -1;
  updateActiveDescendant();
}

function setSelectedIndex(idx) {
  const items = list.querySelectorAll('.cmdk-item:not(.cmdk-empty)');
  if (idx < 0 || idx >= items.length) return;
  items.forEach((el, i) => {
    el.classList.toggle('selected', i === idx);
    el.setAttribute('aria-selected', i === idx ? 'true' : 'false');
  });
  selectedIndex = idx;
  updateActiveDescendant();
}

function updateActiveDescendant() {
  const items = list.querySelectorAll('.cmdk-item:not(.cmdk-empty)');
  if (selectedIndex >= 0 && items[selectedIndex]) {
    input.setAttribute('aria-activedescendant', items[selectedIndex].id);
  } else {
    input.setAttribute('aria-activedescendant', '');
  }
}

function selectItem(item) {
  closeCmdK();
  if (onSelectCallback) onSelectCallback(item);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Event listeners ─────────────────────────────────────────────────

input.addEventListener('input', (e) => {
  const query = e.target.value.trim();
  const results = query ? fuse.search(query).map(r => r.item) : commands;
  renderList(results);
});

input.addEventListener('keydown', (e) => {
  const items = list.querySelectorAll('.cmdk-item:not(.cmdk-empty)');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSelectedIndex(Math.min(selectedIndex + 1, items.length - 1));
    scrollIntoView(items[selectedIndex]);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSelectedIndex(Math.max(selectedIndex - 1, 0));
    scrollIntoView(items[selectedIndex]);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedIndex >= 0 && items[selectedIndex]) {
      const item = items[selectedIndex].__item;
      selectItem(item || commands[selectedIndex]);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeCmdK();
  }
});

dialog.addEventListener('click', (e) => {
  if (e.target === dialog || e.target.classList.contains('cmdk-overlay')) {
    closeCmdK();
  }
});

function scrollIntoView(el) {
  if (!el) return;
  const listRect = list.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  if (elRect.top < listRect.top) {
    list.scrollTop -= listRect.top - elRect.top;
  } else if (elRect.bottom > listRect.bottom) {
    list.scrollTop += elRect.bottom - listRect.bottom;
  }
}

// ── Export ──────────────────────────────────────────────────────────

window.CmdK = { open: openCmdK, close: closeCmdK, register: registerCommands };
