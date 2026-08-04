// Background service worker — the ONLY place in this extension that talks to
// the Fluent backend. Content scripts and popup/options pages never fetch
// directly; they send a chrome.runtime message and get a plain JSON result.
//
// MV3 service workers are killed after ~30s idle and lose any in-memory
// state, so the JWT and the chosen backend environment always live in
// chrome.storage.local — never in a module-level variable.

const BACKEND_URLS = {
  prod: 'https://fluent.lt',
  local: 'http://localhost:8000',
};

async function getSettings() {
  const { token = null, backendEnv = 'prod' } = await chrome.storage.local.get(['token', 'backendEnv']);
  const base = BACKEND_URLS[backendEnv] || BACKEND_URLS.prod;
  return { token, backendEnv, base };
}

async function clearToken() {
  await chrome.storage.local.set({ token: null });
}

// Thin fetch wrapper: attaches the stored JWT, clears it on 401, and always
// resolves (never throws) so message handlers can return a plain result.
async function apiFetch(path, { method = 'GET', params, body } = {}) {
  const { token, base } = await getSettings();
  if (!token) {
    return { ok: false, status: 401, error: 'not_connected' };
  }
  let url = base + path;
  if (params) {
    url += `?${new URLSearchParams(params).toString()}`;
  }

  let resp;
  try {
    resp = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 0, error: 'network' };
  }

  if (resp.status === 401) {
    await clearToken();
    return { ok: false, status: 401, error: 'not_connected' };
  }

  let data = null;
  try {
    data = await resp.json();
  } catch (e) {
    // No/invalid JSON body — leave data null.
  }

  if (!resp.ok) {
    return { ok: false, status: resp.status, error: (data && data.detail) || 'error', data };
  }
  return { ok: true, status: resp.status, data };
}

async function translate(word) {
  const { translationLang = 'en' } = await chrome.storage.local.get('translationLang');
  return apiFetch('/api/extension/translate', { params: { word, lang: translationLang } });
}

async function addWord(lithuanian, translation, translationRu, listId) {
  const result = await apiFetch('/api/extension/words', {
    method: 'POST',
    body: {
      lithuanian,
      translation,
      translation_ru: translationRu || null,
      list_id: listId || null,
    },
  });
  if (!result.ok && result.status === 403) {
    return { ok: false, status: 403, error: 'premium' };
  }
  return result;
}

// Used by the content script's list picker (GET /api/me/word-lists already
// exists for the dashboard's "My lists" page).
function getLists() {
  return apiFetch('/api/me/word-lists');
}

// Combines quota + profile into one status object the UI needs.
async function getStatus() {
  const { token, backendEnv, base } = await getSettings();
  if (!token) {
    return { connected: false, backendEnv, base };
  }
  const quota = await apiFetch('/api/me/quota');
  if (!quota.ok) {
    return { connected: false, backendEnv, base };
  }
  const me = await apiFetch('/api/auth/me');
  return {
    connected: true,
    backendEnv,
    base,
    email: me.ok ? me.data.email : null,
    isPremium: !!quota.data.premium_active,
    isAdmin: !!quota.data.is_admin,
  };
}

// Finds (or opens) a tab at the backend origin, navigates it to /dashboard,
// and polls the page's localStorage every 2s (up to 90s) for the JWT the
// frontend stores there after login. Once found, validates it against the
// backend before saving — an expired/garbage value must not get stored.
async function connect() {
  const { base } = await getSettings();
  const dashboardUrl = `${base}/dashboard`;

  const tabs = await chrome.tabs.query({ url: `${base}/*` });
  let tab = tabs[0];
  if (tab) {
    await chrome.tabs.update(tab.id, { url: dashboardUrl, active: true });
  } else {
    tab = await chrome.tabs.create({ url: dashboardUrl });
  }
  if (!tab || tab.id == null) {
    return { ok: false, error: 'no_tab' };
  }

  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    let token = null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.localStorage.getItem('fluent_token'),
      });
      token = results && results[0] ? results[0].result : null;
    } catch (e) {
      // Tab may still be loading, navigated away, or was closed — keep polling.
      continue;
    }

    if (token) {
      await chrome.storage.local.set({ token });
      const check = await apiFetch('/api/me/quota');
      if (check.ok) {
        return { ok: true };
      }
      // The grabbed value may be an expired token from a previous session —
      // the page will replace it once the user finishes logging in, so clear
      // it and keep polling instead of giving up.
      await clearToken();
    }
  }
  return { ok: false, error: 'timeout' };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message && message.type) {
      case 'translate':
        sendResponse(await translate(message.word));
        break;
      case 'addWord':
        sendResponse(
          await addWord(message.lithuanian, message.translation, message.translation_ru, message.list_id)
        );
        break;
      case 'getStatus':
        sendResponse(await getStatus());
        break;
      case 'getLists':
        sendResponse(await getLists());
        break;
      case 'connect':
        sendResponse(await connect());
        break;
      default:
        sendResponse({ ok: false, error: 'unknown_message' });
    }
  })();
  return true; // keep the message channel open for the async response above
});
