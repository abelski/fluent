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
    // Height is an estimate for viewport-clamping only (the card's real
    // height is content-driven) — kept generous since an enriched card with
    // a grammar line + senses runs taller than the old translation-only card.
    const { x, y } = clamp(rect.left, rect.bottom + 8, 260, 200);
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

    // getLists is fired here too — concurrently with getStatus/translate —
    // rather than later inside renderFooter. Firing it after translation
    // resolves (the old code) added the full getLists round trip (~880ms
    // measured live) as sequential TAIL latency on every Add flow. We don't
    // know yet whether this user is premium/connected (that's what
    // getStatus is for), so non-premium/disconnected users now also fire a
    // getLists call they didn't before — a deliberate, accepted cost:
    // GET /api/me/word-lists is a cheap existing query that returns []
    // quickly for them, and waiting to learn premium status first would
    // just reintroduce the sequential dependency this fixes.
    const [status, translated, listsResp] = await Promise.all([
      sendMessage({ type: 'getStatus' }),
      sendMessage({ type: 'translate', word }),
      sendMessage({ type: 'getLists' }),
    ]);

    if (!cardEl) return; // card was dismissed while we were waiting

    // Whether the headword is showing the dictionary base form (vs. exactly
    // what the user selected). Computed once here and reused everywhere a
    // card decides "which form is primary" — the gloss line below AND
    // renderFooter's Add-button default — so the two can never disagree
    // about which translation belongs to the form actually shown as the
    // headword (see the "saugo/saugoti" gloss-mismatch bug).
    let hasBaseForm = false;
    // Editable translation <input>s, one per language actually shown (at
    // most one "en" and one "ru") — same elements read by the Add-button
    // click handler and reset by the toggle-link handler in renderFooter, so
    // there is exactly one source of truth for "what should be saved."
    const glossInputs = { en: null, ru: null };

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
      hasBaseForm = !!(
        t.base_form &&
        t.base_form.toLowerCase() !== word.toLowerCase() &&
        (t.base_translation_en || t.base_translation_ru)
      );
      body.style.color = '#111827';
      body.textContent = '';
      // The gloss must match whichever form is shown as the headword: the
      // base form's own translation when the headword was upgraded to it,
      // otherwise the exactly-selected form's translation (unchanged from
      // before enrichment existed). Either field may be null — the backend
      // only returns the language(s) requested (the "Translation language"
      // option). Editable so the user can correct a wrong suggestion (e.g.
      // "Дюбель" for "Pundelis") before saving — no automated check can
      // catch a wrong-but-plausible translation.
      const glossEn = hasBaseForm ? t.base_translation_en : t.translation_en;
      const glossRu = hasBaseForm ? t.base_translation_ru : t.translation_ru;
      if (glossEn) {
        glossInputs.en = makeGlossInput(glossEn);
        body.appendChild(glossInputs.en);
      }
      if (glossRu) {
        glossInputs.ru = makeGlossInput(glossRu);
        body.appendChild(glossInputs.ru);
      }

      // Dictionary enrichment (base form / grammar / senses) — every field is
      // nullable, so a plain old-shape response just skips this whole block
      // and the card looks exactly like it did before this feature.
      if (t.base_form) {
        renderAccentedInto(title, t.base_form_accented || t.base_form);
      }
      if (t.part_of_speech || t.grammar_note) {
        const grammarLine = document.createElement('div');
        grammarLine.textContent = [t.part_of_speech, t.grammar_note].filter(Boolean).join(' · ');
        Object.assign(grammarLine.style, {
          fontStyle: 'italic',
          fontSize: '11px',
          color: '#6b7280',
          marginTop: '2px',
          marginBottom: '4px',
        });
        card.insertBefore(grammarLine, body);
      }
      if (Array.isArray(t.senses) && t.senses.length > 0) {
        const sensesBox = document.createElement('div');
        sensesBox.style.marginTop = '6px';
        t.senses.forEach((sense, i) => {
          const line = document.createElement('div');
          line.textContent = `${i + 1}. ${sense}`;
          Object.assign(line.style, { fontSize: '12px', color: '#374151', marginTop: '2px' });
          sensesBox.appendChild(line);
        });
        card.insertBefore(sensesBox, footer);
      }
    }

    await renderFooter(footer, status, word, translated.ok ? translated.data : null, hasBaseForm, glossInputs, listsResp);
  }

  // Small editable text input for a suggested translation. Same visual
  // weight as the old read-only gloss text; stopPropagation isn't needed
  // here beyond what the card already does (see card.addEventListener('mousedown', ...)
  // above), which already shields any click inside the card from the
  // document-level outside-click dismissal handler.
  function makeGlossInput(value) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    Object.assign(input.style, {
      display: 'block',
      width: '100%',
      marginTop: '2px',
      padding: '4px 6px',
      border: '1px solid #d1d5db',
      borderRadius: '4px',
      fontSize: '13px',
      fontFamily: 'inherit',
      color: '#111827',
      background: '#fff',
      boxSizing: 'border-box',
    });
    return input;
  }

  // Vanilla-JS port of frontend/lib/renderAccented.tsx: a "*syllable*"-marked
  // string gets its marked segment wrapped for visual stress-accent highlight;
  // anything else (including plain text, or malformed/odd asterisk counts)
  // renders as-is. Always uses textContent/createElement — never innerHTML —
  // since this text can originate from Wiktionary-derived content.
  function renderAccentedInto(el, text) {
    el.textContent = '';
    if (typeof text !== 'string' || !text) return;
    const parts = text.split('*');
    if (parts.length < 3 || parts.length % 2 === 0) {
      el.textContent = text;
      return;
    }
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        const strong = document.createElement('strong');
        strong.textContent = part;
        Object.assign(strong.style, {
          textDecoration: 'underline',
          textDecorationColor: '#10b981',
          textDecorationThickness: '2px',
        });
        el.appendChild(strong);
      } else if (part) {
        el.appendChild(document.createTextNode(part));
      }
    });
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

  async function renderFooter(footer, status, word, translated, hasBaseForm, glossInputs, listsResp) {
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
    // Best-effort — if the getLists fetch (kicked off back in showCard,
    // concurrently with getStatus/translate) failed or errored, listsResp
    // just won't have the expected shape and we skip straight to the button
    // — exactly the same graceful degradation as before, just fed from a
    // result that's already resolved by the time we get here instead of
    // fetched fresh on this call.
    let selectEl = null;

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

    // Base form vs. exactly-selected form: default to adding the dictionary
    // base form when enrichment found one that differs from the selection
    // and has its own translation; a small toggle link lets the user add the
    // selected (inflected) form instead. With no enrichment (old-shape
    // response, or base_form === the selection) this collapses to exactly
    // the original "Add to learn" behavior. `hasBaseForm` is computed once
    // in showCard (also drives the gloss line) and passed in here so the
    // two never disagree about which form is primary for this card.
    const basePayload = hasBaseForm ? {
      lithuanian: translated.base_form,
      translation: translated.base_translation_en,
      translation_ru: translated.base_translation_ru,
    } : null;
    const selectedPayload = translated ? {
      lithuanian: translated.word || word,
      translation: translated.translation_en,
      translation_ru: translated.translation_ru,
    } : null;

    let activePayload = basePayload || selectedPayload;

    const btn = makeButton(
      basePayload ? `Add "${activePayload.lithuanian}"` : 'Add to learn',
      '#C1272D', '#fff'
    );
    if (!activePayload) {
      btn.disabled = true;
    }

    let toggleLink = null;
    if (basePayload && selectedPayload) {
      toggleLink = document.createElement('button');
      toggleLink.type = 'button';
      toggleLink.textContent = `add "${selectedPayload.lithuanian}" instead`;
      Object.assign(toggleLink.style, {
        display: 'block',
        width: '100%',
        marginTop: '6px',
        padding: '2px 0',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: '11px',
        color: '#6b7280',
        textDecoration: 'underline',
        fontFamily: 'inherit',
      });
      toggleLink.addEventListener('click', () => {
        const showingBase = activePayload === basePayload;
        activePayload = showingBase ? selectedPayload : basePayload;
        btn.textContent = `Add "${activePayload.lithuanian}"`;
        toggleLink.textContent = showingBase
          ? `add "${basePayload.lithuanian}" instead`
          : `add "${selectedPayload.lithuanian}" instead`;
        // Reset the (possibly user-edited) translation inputs to the newly
        // active form's suggested defaults — same elements the Add button
        // reads from below, so there is only ever one place holding "what
        // will actually be saved."
        if (glossInputs.en) glossInputs.en.value = activePayload.translation || '';
        if (glossInputs.ru) glossInputs.ru.value = activePayload.translation_ru || '';
      });
    }

    btn.addEventListener('click', async () => {
      if (!activePayload) return;
      btn.disabled = true;
      btn.textContent = 'Adding…';
      const listId = selectEl ? selectEl.value : '';
      // Read the live input values at click time (the user may have
      // corrected a wrong suggestion) rather than the static payload —
      // falling back to the payload string only if that language has no
      // input at all (shouldn't normally happen, since both are driven by
      // the same "Translation language" setting, but stays safe either way).
      const translationValue = (glossInputs.en ? glossInputs.en.value.trim() : activePayload.translation) || null;
      const translationRuValue = (glossInputs.ru ? glossInputs.ru.value.trim() : activePayload.translation_ru) || null;
      const res = await sendMessage({
        type: 'addWord',
        lithuanian: activePayload.lithuanian,
        translation: translationValue,
        translation_ru: translationRuValue,
        list_id: listId ? Number(listId) : null,
      });
      if (!cardEl) return;
      if (res.ok) {
        if (res.data.already_added) {
          btn.textContent = res.data.location ? `Already in "${res.data.location}"` : 'Already in your list';
        } else {
          btn.textContent = 'Added!';
        }
        if (toggleLink) toggleLink.remove();
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
    if (toggleLink) footer.appendChild(toggleLink);
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
