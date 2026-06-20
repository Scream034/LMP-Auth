'use strict';

const TARGET_COOKIES = [
  'SAPISID', 'SID', 'HSID', 'SSID', 'APISID',
  '__Secure-1PSID', '__Secure-3PSID', '__Secure-1PSIDTS',
  'LOGIN_INFO', 'PREF'
];
const LMP_PORT = 40340;
const LMP_URL = `http://127.0.0.1:${LMP_PORT}/api/auth`;
const PING_URL = `http://127.0.0.1:${LMP_PORT}/api/ping`;

// ─── i18n helper ────────────────────────────────────────────────────────────
const t = (key, ...subs) => chrome.i18n.getMessage(key, subs) || key;

// ─── DOM refs ────────────────────────────────────────────────────────────────
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('status');
const serverDot = document.getElementById('serverDot');
const serverText = document.getElementById('serverText');
const legendToggle = document.getElementById('legendToggle');
const legendBody = document.getElementById('legendBody');

// ─── Init text content ───────────────────────────────────────────────────────
document.getElementById('desc').textContent = t('desc');
sendBtn.textContent = t('btnSend');
legendToggle.textContent = t('legendToggle');
document.getElementById('lg-checking').textContent = t('legendChecking');
document.getElementById('lg-ready').textContent = t('legendReady');
document.getElementById('lg-notfound').textContent = t('legendNotFound');
document.getElementById('lg-ok').textContent = t('legendOk');
document.getElementById('lg-copied').textContent = t('legendCopied');
document.getElementById('lg-nologin').textContent = t('legendNoLogin');

// ─── Legend toggle ───────────────────────────────────────────────────────────
legendToggle.addEventListener('click', () => legendBody.classList.toggle('open'));

// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * @param {string} text
 * @param {'ok'|'warn'|'err'|''} kind
 */
function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + kind;
}

/**
 * @param {'ok'|'warn'|'err'} kind
 */
function setServerStatus(kind) {
  serverDot.className = 'dot ' + kind;
  serverText.textContent =
    kind === 'ok' ? t('statusReady') :
      kind === 'warn' ? t('statusNotFound') :
        t('statusChecking');
}

// ─── Ping LMP on popup open ──────────────────────────────────────────────────
async function checkServer() {
  serverDot.className = 'dot';
  serverText.textContent = t('statusChecking');
  try {
    const r = await fetch(PING_URL, { method: 'GET', signal: AbortSignal.timeout(2000) });
    setServerStatus(r.ok ? 'ok' : 'warn');
  } catch {
    setServerStatus('warn');
  }
}

checkServer();

// ─── Main: send cookies ──────────────────────────────────────────────────────
sendBtn.addEventListener('click', async () => {
  sendBtn.disabled = true;
  setStatus(t('statusSending'), '');

  try {
    const cookies = await chrome.cookies.getAll({ domain: 'youtube.com' });

    const authCookies = cookies
      .filter(c => TARGET_COOKIES.includes(c.name))
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    if (!authCookies.includes('SAPISID')) {
      setStatus(t('statusNoLogin'), 'err');
      sendBtn.disabled = false;
      return;
    }

    // ── Try sending to LMP ──────────────────────────────────────────────────
    let sent = false;
    try {
      const res = await fetch(LMP_URL, {
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
        // Button stays disabled — the task is done
        return;
      }
    } catch {
      /* LMP not reachable — fall through to clipboard */
    }

    if (!sent) {
      // ── Clipboard fallback ────────────────────────────────────────────────
      await navigator.clipboard.writeText(authCookies);
      setServerStatus('warn');
      setStatus(t('statusCopied'), 'warn');
      // Keep button enabled so user can retry
      sendBtn.disabled = false;
    }

  } catch (err) {
    setStatus(t('statusError', String(err.message ?? err)), 'err');
    sendBtn.disabled = false;
  }
});