// Content script — draws a small floating icon + translation card next to a
// selected word. Everything lives inside a CLOSED shadow root with inline
// styles so host-page CSS/CSP can neither style nor read our UI, and our UI
// can never leak layout/class names into the host page.
//
// No network calls happen here — all backend access goes through
// background.js via chrome.runtime.sendMessage.

(() => {
  let hostEl = null;
  let shadow = null;
  let iconEl = null;
  let cardEl = null;
  let lastRect = null;

  // ── Selection validation ────────────────────────────────────────────────

  function isEditableTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    return !!(el.closest && el.closest('[contenteditable="true"], [contenteditable=""]'));
  }

  // Mirrors the backend's validation (routers/extension.py:_validate_word):
  // 1-4 whitespace-separated tokens, 2-80 chars total, must contain a letter,
  // and only letters/marks/spaces/hyphens/apostrophes (rejects URLs, prices,
  // sentences with punctuation, etc).
  function isCandidateWord(text) {
    if (!text || text.length < 2 || text.length > 80) return false;
    const tokens = text.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 4) return false;
    if (!/\p{L}/u.test(text)) return false;
    if (!/^[\p{L}\p{M}\s'-]+$/u.test(text)) return false;
    return true;
  }

  function getSelectionInfo() {
    const sel = window.getSelection();
    const text = sel && sel.toString().trim();
    if (!text || sel.rangeCount === 0) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return { text, rect };
  }

  // ── Shadow DOM host ──────────────────────────────────────────────────────

  function ensureHost() {
    if (shadow) return shadow;
    hostEl = document.createElement('div');
    hostEl.style.all = 'initial';
    hostEl.style.position = 'fixed';
    hostEl.style.top = '0';
    hostEl.style.left = '0';
    hostEl.style.zIndex = '2147483647';
    document.documentElement.appendChild(hostEl);
    shadow = hostEl.attachShadow({ mode: 'closed' });
    return shadow;
  }

  function clamp(x, y, w, h) {
    const maxX = Math.max(4, window.innerWidth - w - 4);
    const maxY = Math.max(4, window.innerHeight - h - 4);
    return { x: Math.min(Math.max(4, x), maxX), y: Math.min(Math.max(4, y), maxY) };
  }

  function removeIcon() {
    if (iconEl) { iconEl.remove(); iconEl = null; }
  }
  function removeCard() {
    if (cardEl) { cardEl.remove(); cardEl = null; }
  }
  function removeAll() {
    removeIcon();
    removeCard();
  }

  // ── Floating icon ────────────────────────────────────────────────────────

  function showIcon(rect, word) {
    removeAll();
    const sh = ensureHost();
    const icon = document.createElement('div');
    icon.textContent = 'f.';
    const { x, y } = clamp(rect.right, rect.bottom + 4, 24, 24);
    Object.assign(icon.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      background: '#006A44',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '11px',
      fontWeight: '700',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      userSelect: 'none',
    });
    icon.addEventListener('mousedown', (e) => e.stopPropagation());
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      showCard(rect, word);
    });
    sh.appendChild(icon);
    iconEl = icon;
  }

  // ── Translation card ─────────────────────────────────────────────────────

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (resp) => resolve(resp || { ok: false, error: 'no_response' }));
      } catch (e) {
        resolve({ ok: false, error: 'no_response' });
      }
    });
  }

  async function showCard(rect, word) {
    removeIcon();
    removeCard();
    const sh = ensureHost();

    const card = document.createElement('div');
    const { x, y } = clamp(rect.left, rect.bottom + 8, 260, 120);
    Object.assign(card.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: '260px',
      background: '#ffffff',
      color: '#111827',
      border: '1px solid #e5e7eb',
      borderRadius: '10px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      padding: '12px 14px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      lineHeight: '1.4',
    });
    card.addEventListener('mousedown', (e) => e.stopPropagation());

    const title = document.createElement('div');
    title.textContent = word;
    Object.assign(title.style, {
      fontWeight: '700',
      fontSize: '15px',
      marginBottom: '6px',
      color: '#006A44',
      wordBreak: 'break-word',
    });
    card.appendChild(title);

    const body = document.createElement('div');
    body.textContent = 'Translating…';
    body.style.color = '#6b7280';
    card.appendChild(body);

    const footer = document.createElement('div');
    footer.style.marginTop = '10px';
    card.appendChild(footer);

    sh.appendChild(card);
    cardEl = card;

    const [status, translated] = await Promise.all([
      sendMessage({ type: 'getStatus' }),
      sendMessage({ type: 'translate', word }),
    ]);

    if (!cardEl) return; // card was dismissed while we were waiting

    if (!translated.ok) {
      body.style.color = '#6b7280';
      if (translated.status === 401 || translated.error === 'not_connected') {
        body.textContent = 'Connect Fluent to see translations.';
      } else if (translated.status === 404) {
        body.textContent = 'No translation found.';
      } else if (translated.status === 422) {
        body.textContent = "That doesn't look like a word.";
      } else {
        body.textContent = 'Something went wrong. Try again.';
      }
    } else {
      const t = translated.data;
      body.style.color = '#111827';
      // The backend only returns the language(s) requested (per the
      // "Translation language" option) — either field may be null.
      if (t.translation_en && t.translation_ru) {
        body.textContent = `${t.translation_en} · ${t.translation_ru}`;
      } else {
        body.textContent = t.translation_en || t.translation_ru || '';
      }
    }

    await renderFooter(footer, status, word, translated.ok ? translated.data : null);
  }

  function makeButton(label, bg, color) {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      width: '100%',
      padding: '8px 10px',
      borderRadius: '6px',
      border: 'none',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: '600',
      fontFamily: 'inherit',
      background: bg,
      color,
    });
    return btn;
  }

  async function renderFooter(footer, status, word, translated) {
    footer.innerHTML = '';
    const base = (status && status.base) || 'https://fluent.lt';

    if (!status || !status.connected) {
      const btn = makeButton('Connect Fluent', '#006A44', '#fff');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Opening fluent.lt…';
        const res = await sendMessage({ type: 'connect' });
        if (!cardEl) return;
        if (res.ok) {
          showCard(lastRect || footer.getBoundingClientRect(), word);
        } else {
          btn.disabled = false;
          btn.textContent = 'Connect Fluent';
        }
      });
      footer.appendChild(btn);
      return;
    }

    if (!status.isPremium && !status.isAdmin) {
      const btn = makeButton('Upgrade to add', '#FFB81C', '#111827');
      btn.addEventListener('click', () => {
        window.open(`${base}/dashboard`, '_blank', 'noopener');
      });
      footer.appendChild(btn);
      return;
    }

    // Premium/admin: optional "which list?" picker above the Add button.
    // Best-effort — if fetching the list fails, just skip straight to the button.
    let selectEl = null;
    const listsResp = await sendMessage({ type: 'getLists' });
    if (!cardEl) return; // card was dismissed while we were waiting

    if (listsResp && listsResp.ok && Array.isArray(listsResp.data)) {
      selectEl = document.createElement('select');
      Object.assign(selectEl.style, {
        width: '100%',
        marginBottom: '8px',
        padding: '6px 8px',
        borderRadius: '6px',
        border: '1px solid #d1d5db',
        fontSize: '12px',
        fontFamily: 'inherit',
        background: '#fff',
        color: '#111827',
      });

      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = 'From internet (default)';
      selectEl.appendChild(defaultOpt);

      // "From internet" is already covered by the default option — listing it
      // again would just duplicate the same destination under a second entry.
      const otherLists = listsResp.data.filter((l) => l.title !== 'From internet');
      for (const l of otherLists) {
        const opt = document.createElement('option');
        opt.value = String(l.id);
        opt.textContent = l.title;
        selectEl.appendChild(opt);
      }

      const { lastListId } = await chrome.storage.local.get('lastListId');
      if (lastListId && otherLists.some((l) => String(l.id) === String(lastListId))) {
        selectEl.value = String(lastListId);
      }

      footer.appendChild(selectEl);
    }

    const btn = makeButton('Add to learn', '#C1272D', '#fff');
    if (!translated) {
      btn.disabled = true;
    }
    btn.addEventListener('click', async () => {
      if (!translated) return;
      btn.disabled = true;
      btn.textContent = 'Adding…';
      const listId = selectEl ? selectEl.value : '';
      const res = await sendMessage({
        type: 'addWord',
        lithuanian: translated.word || word,
        translation: translated.translation_en,
        translation_ru: translated.translation_ru || null,
        list_id: listId ? Number(listId) : null,
      });
      if (!cardEl) return;
      if (res.ok) {
        btn.textContent = res.data.already_added ? 'Already in your list' : 'Added!';
        await chrome.storage.local.set({ lastListId: listId });
      } else if (res.error === 'premium') {
        btn.textContent = 'Upgrade to add';
        btn.disabled = false;
      } else {
        btn.textContent = 'Failed — try again';
        btn.disabled = false;
      }
    });
    footer.appendChild(btn);
  }

  // ── Event wiring ─────────────────────────────────────────────────────────

  document.addEventListener('mouseup', (e) => {
    if (hostEl && e.composedPath && e.composedPath().includes(hostEl)) return;
    if (isEditableTarget(e.target)) return;
    setTimeout(() => {
      const info = getSelectionInfo();
      if (!info || !isCandidateWord(info.text)) {
        removeIcon();
        return;
      }
      lastRect = info.rect;
      showIcon(info.rect, info.text);
    }, 0);
  });

  document.addEventListener('dblclick', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (isEditableTarget(e.target)) return;
    setTimeout(() => {
      const info = getSelectionInfo();
      if (!info || !isCandidateWord(info.text)) return;
      lastRect = info.rect;
      showCard(info.rect, info.text);
    }, 0);
  });

  document.addEventListener('mousedown', (e) => {
    if (hostEl && e.composedPath && e.composedPath().includes(hostEl)) return;
    removeAll();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeAll();
  });
  window.addEventListener('scroll', () => removeAll(), true);
  window.addEventListener('blur', () => removeAll());
})();
