import { mergeTrees, normalizeUrl, flattenBookmarks } from './merge.js';
import { GitHubAdapter } from './storage.js';

export class SyncManager {
  constructor() {
    this.adapter = null;
    this.isSyncing = false;
  }

  async init() {
    const settings = await chrome.storage.local.get(['mode', 'github']);
    console.log('Initializing SyncManager with mode:', settings.mode);
    
    // Default to github mode if not set
    const mode = settings.mode || 'github';
    
    if (mode === 'github' && settings.github) {
      if (!settings.github.token || !settings.github.owner || !settings.github.repo) {
        console.error('GitHub configuration is incomplete');
        this.adapter = null;
        return;
      }
      this.adapter = new GitHubAdapter(settings.github);
      console.log('GitHub adapter initialized');
    } else {
      console.warn('No valid sync configuration found');
      this.adapter = null;
    }
  }

  async getLocalBookmarks() {
    return new Promise((resolve) => {
      chrome.bookmarks.getTree((tree) => {
        // tree[0] is the invisible root
        // tree[0].children contains:
        // [0]: Bookmarks Bar (收藏栏)
        // [1]: Other Bookmarks (其他收藏)
        // [2]: Mobile Bookmarks (移动设备收藏) - optional
        const roots = tree[0].children || [];
        console.log(`Local tree roots identified: ${roots.map(r => r.title || 'unnamed').join(', ')}`);
        resolve(roots);
      });
    });
  }

  async sync() {
    if (this.isSyncing) return;
    if (!this.adapter) {
      throw new Error('Storage adapter not initialized');
    }
    this.isSyncing = true;

    try {
      console.log('--- Start Syncing ---');
      
      // 1. 获取本地收藏夹
      const local = await this.getLocalBookmarks();
      const localCount = this._countNodes(local);
      console.log(`Local items: ${localCount}`);

      // 2. 从 GitHub 获取远程收藏夹
      const remoteData = await this.adapter.getBookmarks();
      const remote = remoteData.bookmarks || [];
      const remoteCount = this._countNodes(remote);
      console.log(`Remote items: ${remoteCount}`);

      // 3. 获取上次同步的快照
      const { snapshot = [] } = await chrome.storage.local.get('snapshot');
      console.log(`Snapshot items: ${this._countNodes(snapshot)}`);

      // 4. 对比合并：处理新增、修改和删除
      const merged = mergeTrees(local, remote, snapshot);
      const mergedCount = this._countNodes(merged);
      console.log(`Merged total: ${mergedCount}`);

      // 5. 将处理后的数据通过 JSON 格式上传到 GitHub
      console.log('Uploading merged data to GitHub...');
      await this.adapter.saveBookmarks({
        bookmarks: merged,
        lastSync: Date.now()
      });
      console.log('Upload successful');

      // 6. 更新本地收藏夹，确保两端一致（包括应用删除）
      console.log('Updating local bookmarks (applying changes and deletions)...');
      await this.updateLocalBookmarks(merged);
      console.log('Local update complete');

      // 7. 保存最终状态作为下次的快照
      const finalLocal = await this.getLocalBookmarks();
      await chrome.storage.local.set({ 
        snapshot: finalLocal,
        lastSync: Date.now()
      });

      console.log('--- Sync Finished ---');
    } catch (error) {
      console.error('Sync process failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  _countNodes(nodes) {
    let count = 0;
    for (const node of nodes) {
      count++;
      if (node.children) {
        count += this._countNodes(node.children);
      }
    }
    return count;
  }

  async updateLocalBookmarks(merged) {
    const currentLocal = await this.getLocalBookmarks();
    
    const syncRecursive = async (mergedItems, parentId, path = '') => {
      // 1. Get current local items in this folder
      const localItems = await new Promise(r => chrome.bookmarks.getChildren(parentId, r));
      
      const localMap = new Map();
      localItems.forEach(item => {
        const key = item.url ? `u:${normalizeUrl(item.url)}` : `f:${item.title}`;
        localMap.set(key, item);
      });

      const mergedMap = new Map();
      mergedItems.forEach(item => {
        const key = item.url ? `u:${normalizeUrl(item.url)}` : `f:${item.title}`;
        mergedMap.set(key, item);
      });

      // 2. Remove extra local items (Deletions)
      let deleteCount = 0;
      for (const [key, localItem] of localMap) {
        if (!mergedMap.has(key)) {
          try {
            if (localItem.url) {
              await new Promise(r => chrome.bookmarks.remove(localItem.id, r));
            } else {
              await new Promise(r => chrome.bookmarks.removeTree(localItem.id, r));
            }
            console.log(`[Sync] Deleted extra local item: ${path}/${localItem.title}`);
            deleteCount++;
          } catch (e) {
            console.error(`[Sync] Failed to delete: ${path}/${localItem.title}`, e);
          }
        }
      }
      if (deleteCount > 0) console.log(`[Sync] Total local deletions in ${path || 'root'}: ${deleteCount}`);

      // 3. Create or Update items
      for (const mergedItem of mergedItems) {
        const key = mergedItem.url ? `u:${normalizeUrl(mergedItem.url)}` : `f:${mergedItem.title}`;
        const existing = localMap.get(key);
        const currentPath = `${path}/${mergedItem.title}`;

        if (mergedItem.url) {
          if (!existing) {
            try {
              await chrome.bookmarks.create({
                parentId,
                title: mergedItem.title,
                url: mergedItem.url
              });
              console.log(`[Sync] Created bookmark: ${currentPath}`);
            } catch (e) {
              console.error(`[Sync] Failed to create bookmark: ${currentPath}`, e);
            }
          } else if (existing.title !== mergedItem.title) {
            // Title updated
            try {
              await chrome.bookmarks.update(existing.id, { title: mergedItem.title });
              console.log(`[Sync] Updated bookmark title: ${currentPath}`);
            } catch (e) {
              console.error(`[Sync] Failed to update title: ${currentPath}`, e);
            }
          }
        } else {
          // Folder
          let targetFolderId;
          if (!existing) {
            try {
              const newFolder = await chrome.bookmarks.create({
                parentId,
                title: mergedItem.title
              });
              targetFolderId = newFolder.id;
              console.log(`[Sync] Created folder: ${currentPath}`);
            } catch (e) {
              console.error(`[Sync] Failed to create folder: ${currentPath}`, e);
              continue;
            }
          } else {
            targetFolderId = existing.id;
          }

          // Recurse into children
          await syncRecursive(mergedItem.children || [], targetFolderId, currentPath);
        }
      }
    };

    // System folder type matching
    const getSystemType = (title) => {
      const t = title.toLowerCase();
      if (t.includes('bookmark bar') || t.includes('favorites bar') || 
          t.includes('书签栏') || t.includes('收藏栏') || t.includes('收藏夹栏')) return 'bar';
      if (t.includes('other') || t.includes('其他')) return 'other';
      if (t.includes('mobile') || t.includes('移动') || t.includes('手机')) return 'mobile';
      return null;
    };

    for (const mergedRoot of merged) {
      const mergedType = getSystemType(mergedRoot.title);
      let localRoot = currentLocal.find(l => {
        if (l.title === mergedRoot.title) return true;
        const localType = getSystemType(l.title);
        return mergedType && localType === mergedType;
      });

      if (localRoot) {
        console.log(`[Sync] Syncing Root: "${localRoot.title}"`);
        await syncRecursive(mergedRoot.children || [], localRoot.id, localRoot.title);
      }
    }
  }
}
