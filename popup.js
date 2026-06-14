// TARGET_COOKIES теперь включает LOGIN_INFO и PREF для точной идентификации выбранного канала
const TARGET_COOKIES = [
  "SAPISID", "SID", "HSID", "SSID", "APISID",
  "__Secure-1PSID", "__Secure-3PSID", "__Secure-1PSIDTS",
  "LOGIN_INFO", "PREF"
];

const LMP_PORT = 40340;

const $btn = document.getElementById('sendBtn');
const $status = document.getElementById('status');

$btn.onclick = async () => {
  $btn.disabled = true;
  showStatus('Processing...', '');

  try {
    // Параметр domain: "youtube.com" соберет куки со всех поддоменов (и www, и music)
    const cookies = await chrome.cookies.getAll({ domain: "youtube.com" });

    const authCookies = cookies
      .filter(c => TARGET_COOKIES.includes(c.name))
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    if (!authCookies.includes("SAPISID")) {
      throw new Error("Log in to YouTube or YouTube Music first!");
    }

    try {
      // Отправляем POST на локальный сервер LMP вместе с заголовком версии нашего расширения
      const res = await fetch(`http://127.0.0.1:${LMP_PORT}/api/auth`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'text/plain',
          'X-Extension-Version': chrome.runtime.getManifest().version
        },
        body: authCookies
      });

      if (res.ok) {
        showStatus('Success! You can close this.', 'ok');
        setTimeout(() => window.close(), 1500);
        return;
      }
    } catch {
      console.warn('LMP app is not listening.');
    }

    // Fallback: Copy to clipboard if app is closed/blocked
    await navigator.clipboard.writeText(authCookies);
    showStatus('Copied! Paste manually in LMP.', 'warn');
  } catch (err) {
    showStatus(err.message, 'err');
  } finally {
    $btn.disabled = false;
  }
};

function showStatus(text, state) {
  $status.textContent = text;
  $status.className = 'status ' + state;
}