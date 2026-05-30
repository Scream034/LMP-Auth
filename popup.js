const TARGET_COOKIES = ["SAPISID", "SID", "HSID", "SSID", "APISID", "__Secure-1PSID", "__Secure-3PSID", "__Secure-1PSIDTS"];
const LMP_PORT = 40340;

const $btn = document.getElementById('sendBtn');
const $status = document.getElementById('status');

$btn.onclick = async () => {
  $btn.disabled = true;
  showStatus('Processing...', '');

  try {
    const cookies = await chrome.cookies.getAll({ domain: ".youtube.com" });
    const authCookies = cookies
      .filter(c => TARGET_COOKIES.includes(c.name))
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    if (!authCookies.includes("SAPISID")) {
      throw new Error("Log in to YouTube Music first!");
    }

    try {
      const res = await fetch(`http://127.0.0.1:${LMP_PORT}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
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