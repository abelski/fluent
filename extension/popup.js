// Action popup — shows connection state and quick links. All backend calls
// go through background.js; this file only reads/writes chrome.storage.local
// for the one action (Disconnect) that needs no network request.

const BACKEND_LABELS = { prod: 'Production', local: 'Local dev' };

function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

async function render() {
  const app = document.getElementById('app');
  const status = await sendMessage({ type: 'getStatus' });

  app.innerHTML = '';

  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.innerHTML = '<span>f</span><span class="dot">.</span><span>Fluent</span>';
  app.appendChild(brand);

  const env = document.createElement('div');
  env.className = 'env';
  env.textContent = BACKEND_LABELS[status.backendEnv] || status.backendEnv;
  app.appendChild(env);

  if (!status.connected) {
    const connectBtn = document.createElement('button');
    connectBtn.className = 'primary';
    connectBtn.textContent = 'Connect Fluent';
    connectBtn.addEventListener('click', async () => {
      connectBtn.disabled = true;
      connectBtn.textContent = 'Opening fluent.lt…';
      const res = await sendMessage({ type: 'connect' });
      if (res.ok) {
        render();
      } else {
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect Fluent';
      }
    });
    app.appendChild(connectBtn);
  } else {
    const email = document.createElement('div');
    email.className = 'email';
    email.textContent = status.email || '';
    app.appendChild(email);

    const badge = document.createElement('span');
    if (status.isPremium || status.isAdmin) {
      badge.className = 'badge premium';
      badge.textContent = status.isAdmin ? 'Admin' : 'Premium';
    } else {
      badge.className = 'badge free';
      badge.textContent = 'Free';
    }
    app.appendChild(badge);

    const listsBtn = document.createElement('button');
    listsBtn.className = 'primary';
    listsBtn.textContent = 'Open my lists';
    listsBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: `${status.base}/dashboard/lists` });
    });
    app.appendChild(listsBtn);

    const disconnectBtn = document.createElement('button');
    disconnectBtn.className = 'secondary';
    disconnectBtn.textContent = 'Disconnect';
    disconnectBtn.addEventListener('click', async () => {
      await chrome.storage.local.set({ token: null });
    });
    app.appendChild(disconnectBtn);
  }

  const optionsLink = document.createElement('a');
  optionsLink.href = '#';
  optionsLink.className = 'options-link';
  optionsLink.textContent = 'Backend settings';
  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  app.appendChild(optionsLink);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.token || changes.backendEnv)) render();
});

render();
