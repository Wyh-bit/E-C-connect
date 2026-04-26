import { getTranslation } from './lib/i18n.js';

const syncBtn = document.getElementById('syncBtn');
const statusDiv = document.getElementById('status');
const openOptions = document.getElementById('openOptions');
const titleEl = document.getElementById('i18n-title');

// Update UI with translations
const initI18n = async () => {
  const t = await getTranslation('popup');
  titleEl.textContent = `${t.title} (${t.term})`;
  syncBtn.textContent = t.syncNow;
  openOptions.textContent = t.settings;
  await updateStatus();
};

// Update status display
const updateStatus = async () => {
  const t = await getTranslation('popup');
  const { lastSync } = await chrome.storage.local.get('lastSync');
  const dateStr = lastSync ? new Date(lastSync).toLocaleString() : t.never;
  statusDiv.textContent = `${t.lastSync}${dateStr}`;
};

initI18n();

syncBtn.addEventListener('click', async () => {
  const t = await getTranslation('popup');
  syncBtn.disabled = true;
  syncBtn.textContent = t.syncing;
  
  // 检查是否配置了 GitHub/后端
  const config = await chrome.storage.local.get(['mode', 'github', 'custom']);
  const isConfigured = config.mode === 'github' 
    ? (config.github && config.github.token && config.github.repo && config.github.owner)
    : (config.mode === 'custom' && config.custom && config.custom.token);

  if (!isConfigured) {
    alert(t.failed + 'Please configure settings first.');
    syncBtn.disabled = false;
    syncBtn.textContent = t.syncNow;
    chrome.runtime.openOptionsPage();
    return;
  }
  
  chrome.runtime.sendMessage({ action: 'sync_now' }, (response) => {
    syncBtn.disabled = false;
    syncBtn.textContent = t.syncNow;
    
    if (chrome.runtime.lastError) {
      console.error('Runtime error:', chrome.runtime.lastError);
      alert(t.failed + 'Background service not responding. Please refresh the extension.');
      return;
    }
    
    if (response && response.success) {
      chrome.storage.local.set({ lastSync: Date.now() });
      updateStatus();
    } else {
      alert(t.failed + (response ? response.error : 'Unknown error'));
    }
  });
});

openOptions.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
