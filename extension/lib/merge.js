/**
 * Bookmark Merging and Deduplication Logic
 */

export const normalizeUrl = (url) => {
  if (!url) return '';
  try {
    let u = url.trim();
    // Remove protocol for more aggressive matching if desired, 
    // but here we just do basic cleanup to avoid duplicates
    const urlObj = new URL(u);
    let normalized = urlObj.origin + urlObj.pathname;
    
    // Remove trailing slash
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    
    // Keep search params but sort them for consistent comparison
    if (urlObj.search) {
      const params = new URLSearchParams(urlObj.search);
      params.sort();
      normalized += '?' + params.toString();
    }
    
    return normalized.toLowerCase();
  } catch (e) {
    return url.trim().toLowerCase();
  }
};

/**
 * Merges local and remote bookmark trees with deletion support using a snapshot
 * @param {Array} local - Current local bookmark tree
 * @param {Array} remote - Current remote bookmark tree
 * @param {Array} snapshot - Local bookmark tree from the last sync
 * @returns {Array} The desired final state of the bookmark tree
 */
const getRootType = (title) => {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes('bookmark bar') || t.includes('favorites bar') || 
      t.includes('书签栏') || t.includes('收藏栏') || t.includes('收藏夹栏')) return 'root_bar';
  if (t.includes('other') || t.includes('其他')) return 'root_other';
  if (t.includes('mobile') || t.includes('移动') || t.includes('手机')) return 'root_mobile';
  return null;
};

export const mergeTrees = (local, remote, snapshot = [], isRoot = true) => {
  const result = [];
  
  // Helper to create a map for easy lookup
  const createMap = (nodes, checkRoot) => {
    const map = new Map();
    nodes.forEach(node => {
      let key;
      if (node.url) {
        key = `u:${normalizeUrl(node.url)}`;
      } else {
        const rootType = checkRoot ? getRootType(node.title) : null;
        // For non-root folders, if they have children, we could try to 
        // match them by a hash of their contents to detect renames,
        // but for now, title is the primary key.
        key = rootType ? `r:${rootType}` : `f:${node.title}`;
      }
      
      // If multiple items have the same key, we keep the first one
      // but log it to help debugging.
      if (map.has(key)) {
        console.warn(`[Merge] Duplicate key found: ${key}. This might cause sync issues.`);
      } else {
        map.set(key, node);
      }
    });
    return map;
  };

  const localMap = createMap(local, isRoot);
  const remoteMap = createMap(remote, isRoot);
  const snapshotMap = createMap(snapshot, isRoot);

  const allKeys = new Set([...localMap.keys(), ...remoteMap.keys()]);

  for (const key of allKeys) {
    const localItem = localMap.get(key);
    const remoteItem = remoteMap.get(key);
    const snapshotItem = snapshotMap.get(key);

    if (localItem && remoteItem) {
      if (!localItem.url) {
        const mergedChildren = mergeTrees(
          localItem.children || [], 
          remoteItem.children || [], 
          snapshotItem ? (snapshotItem.children || []) : [],
          false 
        );
        
        // Folders: Decide final title
        let finalTitle = remoteItem.title;
        if (snapshotItem) {
          // If local title changed from snapshot, prefer local
          if (localItem.title !== snapshotItem.title) {
            finalTitle = localItem.title;
          }
        } else if (localItem.title !== remoteItem.title) {
          // No snapshot, prefer local
          finalTitle = localItem.title;
        }

        result.push({
          ...remoteItem,
          title: finalTitle, 
          children: mergedChildren
        });
      } else {
        let finalTitle = remoteItem.title;
        if (snapshotItem) {
          if (localItem.title !== snapshotItem.title) {
            finalTitle = localItem.title;
          } else if (remoteItem.title !== snapshotItem.title) {
            finalTitle = remoteItem.title;
          }
        } else if (localItem.title !== remoteItem.title) {
          finalTitle = localItem.title;
        }

        result.push({
          ...remoteItem,
          title: finalTitle
        });
      }
    } else if (localItem) {
      if (snapshotItem) {
        console.log(`[Merge] Remote deletion detected (exists in snapshot but not remote): ${localItem.title}`);
      } else {
        result.push(localItem);
      }
    } else if (remoteItem) {
      if (snapshotItem) {
        console.log(`[Merge] Local deletion detected (exists in snapshot but not local): ${remoteItem.title}`);
      } else {
        result.push(remoteItem);
      }
    }
  }

  return result;
};

/**
 * Flatten a bookmark tree into a map of normalizedUrl -> item
 * Useful for quick lookups
 */
export const flattenBookmarks = (nodes, map = new Map(), path = '') => {
  for (const node of nodes) {
    if (node.url) {
      const nUrl = normalizeUrl(node.url);
      map.set(nUrl, { ...node, path });
    } else if (node.children) {
      flattenBookmarks(node.children, map, `${path}/${node.title}`);
    }
  }
  return map;
};
