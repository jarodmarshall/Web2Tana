const DEFAULT_OPTIONS = { includeMetadata: true, defaultTag: 'webclip', notificationEnabled: true };
const el = id => document.getElementById(id);

function load() {
  chrome.storage.sync.get(['tanaOptions'], (res) => {
    const opts = (res && res.tanaOptions) ? res.tanaOptions : DEFAULT_OPTIONS;
    el('includeMetadata').checked = !!opts.includeMetadata;
    el('defaultTag').value = opts.defaultTag || '';
    el('notificationEnabled').checked = !!opts.notificationEnabled;
  });
}

function save() {
  const opts = {
    includeMetadata: !!el('includeMetadata').checked,
    defaultTag: (el('defaultTag').value || '').trim(),
    notificationEnabled: !!el('notificationEnabled').checked,
  };
  chrome.storage.sync.set({ tanaOptions: opts }, () => {
    const s = el('status'); s.textContent = 'Saved'; setTimeout(() => s.textContent = '', 1500);
  });
}

function resetDefaults() {
  el('includeMetadata').checked = DEFAULT_OPTIONS.includeMetadata;
  el('defaultTag').value = DEFAULT_OPTIONS.defaultTag;
  el('notificationEnabled').checked = DEFAULT_OPTIONS.notificationEnabled;
  save();
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  el('save').addEventListener('click', save);
  el('reset').addEventListener('click', resetDefaults);
});
