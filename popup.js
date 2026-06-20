'use strict';

const TARGET_COOKIES = [
  'SAPISID', 'SID', 'HSID', 'SSID', 'APISID',
  '__Secure-1PSID', '__Secure-3PSID', '__Secure-1PSIDTS',
  'LOGIN_INFO', 'PREF'
];

const LMP_PORT = 40340;
const BASE_URL = `http://127.0.0.1:${LMP_PORT}`;
const PING_URL = `${BASE_URL}/api/ping`;
const AUTH_URL = `${BASE_URL}/api/auth`;

// YouTube URLs for cookie retrieval via url-based matching
const YT_URLS = [
  'https://www.youtube.com',
  'https://music.youtube.com',
  'https://youtube.com',
  'https://accounts.google.com'
];

// i18n
const t = (key, ...subs) => chrome.i18n.getMessage(key, subs) || key;

// DOM
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('status');
const serverDot = document.getElementById('serverDot');
const serverText = document.getElementById('serverText');
const legendToggle = document.getElementById('legendToggle');
const legendBody = document.getElementById('legendBody');

// Static i18n
document.getElementById('desc').textContent = t('desc');
sendBtn.textContent = t('btnSend');
legendToggle.textContent = t('legendToggle');
document.getElementById('lg-checking').textContent = t('legendChecking');
document.getElementById('lg-ready').textContent = t('legendReady');
document.getElementById('lg-notfound').textContent = t('legendNotFound');
document.getElementById('lg-ok').textContent = t('legendOk');
document.getElementById('lg-copied').textContent = t('legendCopied');
document.getElementById('lg-nologin').textContent = t('legendNoLogin');

// Legend toggle
legendToggle.addEventListener('click', () => legendBody.classList.toggle('open'));

// Helpers
/**
 * @param {string} text
 * @param {'ok'|'warn'|'err'|''} kind
 */
function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + kind;
}

/**
 * @param {'checking'|'ok'|'warn'} kind
 */
function setServerStatus(kind) {
  serverDot.className = 'dot ' + (kind === 'checking' ? '' : kind);
  serverText.textContent =
    kind === 'ok' ? t('statusReady') :
      kind === 'checking' ? t('statusChecking') :
        t('statusNotFound');
}

// Collect cookies from ALL YouTube/Google domains + ALL cookie stores
async function collectAuthCookies() {
  const seen = new Map();

  // 1. Enumerate all cookie stores (default "0" + incognito "1" etc.)
  let storeIds = ['0'];
  try {
    const stores = await chrome.cookies.getAllCookieStores();
    if (stores?.length > 0) {
      storeIds = stores.map(s => s.id);
    }
  } catch { /* fallback to default store */ }

  // 2. For each store × each URL — use `url` parameter (not `domain`)
  //    Chrome matches cookies using its internal domain/path rules
  for (const storeId of storeIds) {
    for (const url of YT_URLS) {
      try {
        const cookies = await chrome.cookies.getAll({ url, storeId });
        for (const c of cookies) {
          if (TARGET_COOKIES.includes(c.name) && !seen.has(c.name)) {
            seen.set(c.name, c.value);
          }
        }
      } catch { /* skip this combination */ }
    }
  }

  // 3. Fallback: get ALL cookies and manually filter by domain
  //    Catches edge cases where url-based lookup misses some cookies
  if (!seen.has('SAPISID')) {
    try {
      const allCookies = await chrome.cookies.getAll({});
      for (const c of allCookies) {
        if (TARGET_COOKIES.includes(c.name) &&
          !seen.has(c.name) &&
          (c.domain.endsWith('youtube.com') ||
            c.domain.endsWith('google.com'))) {
          seen.set(c.name, c.value);
        }
      }
    } catch { /* ignore */ }
  }

  return [...seen.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

// Ping LMP on popup open
async function checkServer() {
  setServerStatus('checking');
  try {
    const r = await fetch(PING_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    setServerStatus(r.ok ? 'ok' : 'warn');
  } catch {
    setServerStatus('warn');
  }
}

checkServer();

// Main: send cookies
sendBtn.addEventListener('click', async () => {
  sendBtn.disabled = true;
  setStatus(t('statusSending'), '');

  try {
    const authCookies = await collectAuthCookies();

    // Must have at least one of the primary session cookies
    const hasSession = authCookies.includes('SAPISID') ||
      authCookies.includes('__Secure-1PSID');

    if (!hasSession) {
      setStatus(t('statusNoLogin'), 'err');
      sendBtn.disabled = false;
      return;
    }

    // Try sending to LMP
    let sent = false;
    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'X-Extension-Version': chrome.runtime.getManifest().version
        },
        body: authCookies,
        signal: AbortSignal.timeout(4000)
      });

      if (res.ok) {
        sent = true;
        setServerStatus('ok');
        setStatus(t('statusOk'), 'ok');
        return;
      }
    } catch {
      /* LMP not reachable — fall through to clipboard */
    }

    // Clipboard fallback
    if (!sent) {
      await navigator.clipboard.writeText(authCookies);
      setServerStatus('warn');
      setStatus(t('statusCopied'), 'warn');
      sendBtn.disabled = false;
    }

  } catch (err) {
    setStatus(t('statusError', String(err?.message ?? err)), 'err');
    sendBtn.disabled = false;
  }
});