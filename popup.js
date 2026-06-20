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

//  i18n 
const t = (key, ...subs) => chrome.i18n.getMessage(key, subs) || key;

//  DOM 
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('status');
const serverDot = document.getElementById('serverDot');
const serverText = document.getElementById('serverText');
const legendToggle = document.getElementById('legendToggle');
const legendBody = document.getElementById('legendBody');

//  Static i18n 
document.getElementById('desc').textContent = t('desc');
sendBtn.textContent = t('btnSend');
legendToggle.textContent = t('legendToggle');
document.getElementById('lg-checking').textContent = t('legendChecking');
document.getElementById('lg-ready').textContent = t('legendReady');
document.getElementById('lg-notfound').textContent = t('legendNotFound');
document.getElementById('lg-ok').textContent = t('legendOk');
document.getElementById('lg-copied').textContent = t('legendCopied');
document.getElementById('lg-nologin').textContent = t('legendNoLogin');

//  Legend toggle 
legendToggle.addEventListener('click', () => legendBody.classList.toggle('open'));

//  Helpers 
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

//  Collect cookies from both youtube.com and music.youtube.com 
async function collectAuthCookies() {
  const [ytCookies, ytmCookies] = await Promise.all([
    chrome.cookies.getAll({ domain: 'youtube.com' }),
    chrome.cookies.getAll({ domain: 'music.youtube.com' })
  ]);

  // Deduplicate by name — prefer youtube.com value (arrived first)
  const seen = new Map();
  for (const c of [...ytCookies, ...ytmCookies]) {
    if (TARGET_COOKIES.includes(c.name) && !seen.has(c.name)) {
      seen.set(c.name, c.value);
    }
  }

  return [...seen.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

//  Ping LMP on popup open 
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

//  Main: send cookies 
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

    //  Try sending to LMP 
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
        // Button stays disabled — task is done, window will close from LMP side
        return;
      }
    } catch {
      /* LMP not reachable — fall through to clipboard */
    }

    //  Clipboard fallback 
    if (!sent) {
      await navigator.clipboard.writeText(authCookies);
      setServerStatus('warn');
      setStatus(t('statusCopied'), 'warn');
      sendBtn.disabled = false; // Allow retry
    }

  } catch (err) {
    setStatus(t('statusError', String(err?.message ?? err)), 'err');
    sendBtn.disabled = false;
  }
});