// Action popup — "02 — Toolbar" from Fluent Extension.dc.html: header (TAK
// float mark + wordmark + a real CEFR level pill), a stat block (total saved
// + progress bar toward the next level), a 2-column row (total saved | due
// for review), then up to 3 buttons. All backend calls go through
// background.js; this file only reads/writes chrome.storage.local for the
// one action (Disconnect) that needs no network request.

const BACKEND_LABELS = { prod: 'Production', local: 'Local dev' };

function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

// Current level = the highest threshold entry whose threshold <= total;
// next level = the following entry in the (ascending) list, or null once
// already at the top level (e.g. C2) — callers hide the progress bar/
// next-level line entirely in that case.
function computeLevelInfo(thresholds, total) {
  let idx = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (thresholds[i].threshold <= total) idx = i;
  }
  return { current: thresholds[idx], next: thresholds[idx + 1] || null };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

async function render() {
  const app = document.getElementById('app');
  const status = await sendMessage({ type: 'getStatus' });

  app.innerHTML = '';

  // Dev-only: a real user only ever has one backend, so "Production" would
  // just be confusing chrome — see background.js's DEV_EMAIL/devUnlocked.
  if (status.devUnlocked) {
    const env = el('div', 'env', BACKEND_LABELS[status.backendEnv] || status.backendEnv);
    app.appendChild(env);
  }

  const card = el('div', 'card');
  app.appendChild(card);

  const header = el('div', 'card-header');
  header.innerHTML = takBareSVG(26);
  header.appendChild(el('span', 'brand', 'fluent'));
  card.appendChild(header);

  if (!status.connected) {
    const buttons = el('div', 'buttons');
    const connectBtn = el('button', 'btn btn-primary', 'Connect Fluent');
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
    buttons.appendChild(connectBtn);
    card.appendChild(buttons);
    appendFooterLinks(app, status);
    return;
  }

  // Best-effort, fired concurrently — a stats/thresholds/lists fetch failing
  // must never block the rest of the popup (the two link buttons, footer,
  // etc). "Words saved" is deliberately NOT stats.known+learning: adding a
  // word via the extension only creates a WordListItem, never a
  // UserWordProgress row (see backend/routers/extension.py's
  // add_extension_word), so known+learning never moves when you save one —
  // it'd show a number that's stuck until the user studies elsewhere. The
  // list endpoint's word_count is unfiltered by study status and does
  // increment immediately on save, so it's summed across all lists instead.
  const [stats, thresholdsResp, listsResp] = await Promise.all([
    sendMessage({ type: 'getStats' }),
    sendMessage({ type: 'getCefrThresholds' }),
    sendMessage({ type: 'getLists' }),
  ]);

  const total = (listsResp && listsResp.ok && Array.isArray(listsResp.data))
    ? listsResp.data.reduce((sum, wl) => sum + (wl.word_count || 0), 0)
    : 0;

  const dueReview = (stats && stats.ok && stats.data) ? (stats.data.due_review || 0) : 0;
  const haveTotal = listsResp && listsResp.ok && Array.isArray(listsResp.data);

  if (haveTotal && thresholdsResp && thresholdsResp.ok && Array.isArray(thresholdsResp.data) && thresholdsResp.data.length) {
    const { current, next } = computeLevelInfo(thresholdsResp.data, total);
    header.appendChild(el('span', 'tag-outline', current.level));

    const statBlock = el('div', 'stat-block');
    const statRow = el('div', 'stat-row');
    statRow.appendChild(el('span', 'stat-total', String(total)));
    statRow.appendChild(el('span', 'stat-label', 'words saved'));
    statBlock.appendChild(statRow);

    if (next) {
      const pct = Math.max(0, Math.min(100, ((total - current.threshold) / (next.threshold - current.threshold)) * 100));
      const track = el('div', 'progress-track');
      const fill = el('div', 'progress-fill');
      fill.style.width = `${pct}%`;
      track.appendChild(fill);
      statBlock.appendChild(track);
      statBlock.appendChild(el('div', 'stat-next', `${next.threshold - total} to ${next.level}`));
    }
    card.appendChild(statBlock);
  }

  if (haveTotal) {
    const twoCol = el('div', 'two-col');
    const savedCell = el('div');
    savedCell.appendChild(el('div', 'cell-value', String(total)));
    savedCell.appendChild(el('div', 'cell-label', 'words saved'));
    twoCol.appendChild(savedCell);

    const dueCell = el('div');
    dueCell.appendChild(el('div', 'cell-value accent', String(dueReview)));
    dueCell.appendChild(el('div', 'cell-label', 'due for review'));
    twoCol.appendChild(dueCell);
    card.appendChild(twoCol);
  }

  const buttons = el('div', 'buttons');

  if (dueReview > 0) {
    const reviewBtn = el('button', 'btn btn-primary', `Review ${dueReview} words`);
    reviewBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: `${status.base}/dashboard/review` });
    });
    buttons.appendChild(reviewBtn);
  }

  // "Open my vocabulary" repurposes the mockup's "Highlight saved words on
  // this page" button — content.js has no page-scanning/highlighting
  // feature (out of scope, see Plan #35's Context), so this now opens the
  // vocabulary page instead, and the label says so rather than keeping the
  // old, no-longer-true wording. Steps up to primary when there's no review
  // CTA above it, so there's never a dead/secondary-only popup.
  const vocabBtn = el('button', dueReview > 0 ? 'btn btn-secondary' : 'btn btn-primary', 'Open my vocabulary');
  vocabBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: `${status.base}/dashboard/vocabulary` });
  });
  buttons.appendChild(vocabBtn);

  const siteBtn = el('button', 'btn btn-ghost', 'Open fluent.lt →');
  siteBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: status.base });
  });
  buttons.appendChild(siteBtn);

  card.appendChild(buttons);
  appendFooterLinks(app, status, true);
}

// Disconnect + Backend settings — small muted text links, not depicted in
// the mockup at all but necessary chrome; styled to match its typographic
// conventions (small, muted, no button chrome) rather than inventing a new
// visual language for them.
function appendFooterLinks(app, status, includeDisconnect) {
  const footer = el('div', 'footer-links');

  if (includeDisconnect) {
    const disconnect = el('a', null, 'Disconnect');
    disconnect.href = '#';
    disconnect.addEventListener('click', async (e) => {
      e.preventDefault();
      await chrome.storage.local.set({ token: null });
    });
    footer.appendChild(disconnect);
  } else {
    footer.appendChild(el('span'));
  }

  const optionsLink = el('a', null, 'Backend settings');
  optionsLink.href = '#';
  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  footer.appendChild(optionsLink);

  app.appendChild(footer);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.token || changes.backendEnv)) render();
});

render();
