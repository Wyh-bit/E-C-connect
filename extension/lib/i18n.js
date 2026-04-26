export const translations = {
  zh: {
    popup: {
      title: 'E-C connect',
      lastSync: '上次同步: ',
      syncNow: '立即同步',
      syncing: '同步中...',
      settings: '设置',
      never: '从未',
      success: '同步完成！',
      failed: '同步失败: ',
      bookmarks: '书签',
      favorites: '收藏'
    },
    options: {
      title: '同步设置',
      language: '语言',
      ghToken: 'GitHub 访问令牌 (Token)',
      ghRepo: '仓库名称',
      ghOwner: '用户名 (Owner)',
      save: '保存配置',
      saveSuccess: '设置已保存！',
      bookmarks: '书签',
      favorites: '收藏'
    }
  },
  en: {
    popup: {
      title: 'E-C connect',
      lastSync: 'Last Sync: ',
      syncNow: 'Sync Now',
      syncing: 'Syncing...',
      settings: 'Settings',
      never: 'Never',
      success: 'Sync completed!',
      failed: 'Sync failed: ',
      bookmarks: 'Bookmarks',
      favorites: 'Favorites'
    },
    options: {
      title: 'Sync Settings',
      language: 'Language',
      ghToken: 'GitHub Access Token',
      ghRepo: 'Repository Name',
      ghOwner: 'Owner (Username)',
      save: 'Save Configuration',
      saveSuccess: 'Settings saved!',
      bookmarks: 'Bookmarks',
      favorites: 'Favorites'
    }
  }
};

export const getBrowserType = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('edg/')) {
    return 'edge';
  }
  return 'chrome';
};

export const getTranslation = async (path) => {
  const { lang = 'zh' } = await chrome.storage.local.get('lang');
  const browser = getBrowserType();
  const keys = path.split('.');
  let result = translations[lang];
  for (const key of keys) {
    result = result[key];
  }

  // Handle dynamic terminology for Bookmarks/Favorites
  if (typeof result === 'object' && result !== null) {
    const terminology = browser === 'edge' ? result.favorites : result.bookmarks;
    // Replace placeholder if exists, or return the whole object
    return { ...result, term: terminology };
  }
  return result;
};
