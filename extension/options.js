import { getTranslation } from './lib/i18n.js';

const configGithub = document.getElementById('configGithub');
const langSelect = document.getElementById('langSelect');

// Update UI with translations
const initI18n = async () => {
  const t = await getTranslation('options');
  document.getElementById('i18n-title').textContent = `${t.title} (${t.term})`;
  document.getElementById('i18n-lang-label').textContent = t.language;
  document.getElementById('i18n-ghToken').textContent = t.ghToken;
  document.getElementById('i18n-ghRepo').textContent = t.ghRepo;
  document.getElementById('i18n-ghOwner').textContent = t.ghOwner;
  document.getElementById('save').textContent = t.save;
};

// Load existing settings
chrome.storage.local.get(['github', 'lang'], (data) => {
  if (data.lang) {
    langSelect.value = data.lang;
  }
  initI18n(); // Call after loading lang

  if (data.github) {
    document.getElementById('ghToken').value = data.github.token || '';
    document.getElementById('ghRepo').value = data.github.repo || '';
    document.getElementById('ghOwner').value = data.github.owner || '';
  }
});

// Save settings
document.getElementById('save').addEventListener('click', async () => {
  const t = await getTranslation('options');
  const settings = { 
    mode: 'github',
    lang: langSelect.value,
    github: {
      token: document.getElementById('ghToken').value,
      repo: document.getElementById('ghRepo').value,
      owner: document.getElementById('ghOwner').value
    }
  };
  
  chrome.storage.local.set(settings, () => {
    alert(t.saveSuccess);
    initI18n(); // Refresh UI language
  });
});
