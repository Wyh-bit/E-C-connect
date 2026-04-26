import { SyncManager } from './lib/sync.js';

const syncManager = new SyncManager();
let debounceTimer = null;

const triggerSync = () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    console.log('Bookmark change detected, syncing...');
    await syncManager.init();
    try {
      await syncManager.sync();
    } catch (e) {
      console.error('Auto-sync failed', e);
    }
  }, 5000); // 5 seconds debounce
};

// Listen for bookmark events
chrome.bookmarks.onCreated.addListener(triggerSync);
chrome.bookmarks.onRemoved.addListener(triggerSync);
chrome.bookmarks.onChanged.addListener(triggerSync);
chrome.bookmarks.onMoved.addListener(triggerSync);
chrome.bookmarks.onChildrenReordered.addListener(triggerSync);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sync_now') {
    (async () => {
      try {
        await syncManager.init();
        await syncManager.sync();
        sendResponse({ success: true });
      } catch (err) {
        console.error('Manual sync failed:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep channel open for async response
  }
});

console.log('Background worker initialized');
