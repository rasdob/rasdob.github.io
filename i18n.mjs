import pageChinese from './page-zh.mjs?v=20261027corners1';
import appChinese from './app-zh.mjs?v=20261027corners1';
import animationChinese from './animation-zh.mjs?v=20261027corners1';

const chinese = {...pageChinese, ...animationChinese, ...appChinese};
const storageKey = 'ra-sdob-language';
let language = 'en';
let pageBindings = [];
let initialized = false;
const listeners = new Set();

export function getLanguage() { return language; }

export function t(source, values = {}) {
  const text = language === 'cn' ? (chinese[source] ?? source) : source;
  return String(text).replace(/\{(\w+)\}/g, (token, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : token);
}

export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLanguage(next, {persist = true} = {}) {
  language = next === 'cn' ? 'cn' : 'en';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language === 'cn' ? 'zh-CN' : 'en';
    for (const {node, attribute, source} of pageBindings) {
      if (!node.isConnected) continue;
      if (attribute) node.setAttribute(attribute, t(source));
      else node.nodeValue = source.replace(source.trim(), t(source.trim()));
    }
    document.querySelectorAll('[data-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
    });
  }
  if (persist) {
    try { localStorage.setItem(storageKey, language); } catch { /* Storage is optional. */ }
  }
  for (const listener of listeners) listener(language);
}

export function initializeLanguage() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  const walker = document.createTreeWalker(document.documentElement, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.trim() && !node.parentElement?.closest('script, style, [data-i18n-skip]')) {
      pageBindings.push({node, source: node.nodeValue});
    }
  }
  document.querySelectorAll('[aria-label], [title], [alt], meta[name="description"]').forEach(node => {
    if (node.closest('[data-i18n-skip]')) return;
    for (const attribute of ['aria-label', 'title', 'alt', ...(node.tagName === 'META' ? ['content'] : [])]) {
      if (node.hasAttribute(attribute)) pageBindings.push({node, attribute, source: node.getAttribute(attribute)});
    }
  });
  document.querySelectorAll('[data-language]').forEach(button => {
    button.addEventListener('click', () => setLanguage(button.dataset.language));
  });
  let saved = 'en';
  try { saved = localStorage.getItem(storageKey) || 'en'; } catch { /* Default to English. */ }
  setLanguage(saved, {persist: false});
}
