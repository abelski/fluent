// Options page — pick Production vs Local dev backend, and the translation
// language for the popup card. No network calls here; just reads/writes
// chrome.storage.local (background.js does all fetching).

const envRadios = document.querySelectorAll('input[name="env"]');
const langRadios = document.querySelectorAll('input[name="lang"]');
const note = document.getElementById('note');

async function load() {
  const { backendEnv = 'prod', translationLang = 'en' } = await chrome.storage.local.get([
    'backendEnv',
    'translationLang',
  ]);
  envRadios.forEach((r) => {
    r.checked = r.value === backendEnv;
  });
  langRadios.forEach((r) => {
    r.checked = r.value === translationLang;
  });
}

envRadios.forEach((r) => {
  r.addEventListener('change', async (e) => {
    if (!e.target.checked) return;
    // Production and local dev use different JWT secrets, so a token from
    // one is meaningless (and rejected with 401) on the other — clear it
    // whenever the backend changes so the UI doesn't show a stale "Connected".
    await chrome.storage.local.set({ backendEnv: e.target.value, token: null });
    note.textContent = 'Backend switched. Click Connect Fluent again to reconnect.';
  });
});

langRadios.forEach((r) => {
  r.addEventListener('change', async (e) => {
    if (!e.target.checked) return;
    // Purely a display preference — does not affect the stored connection.
    await chrome.storage.local.set({ translationLang: e.target.value });
  });
});

load();
