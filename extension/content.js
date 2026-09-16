// Content script — draws a small floating pill + "Add card" next to a
// selected word. Everything lives inside a CLOSED shadow root with inline
// styles so host-page CSS/CSP can neither style nor read our UI, and our UI
// can never leak layout/class names into the host page.
//
// No network calls happen here — all backend access goes through
// background.js via chrome.runtime.sendMessage.
//
// Visual values below pixel-match `temp_files/redesign extention/Fluent
// Extension.dc.html` (Plan #35) via extension/theme.js's FLUENT_THEME.

(() => {
  let hostEl = null;
  let shadow = null;
  let iconEl = null;
  let cardEl = null;
  let lastRect = null;
  let lastWord = null;

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

    // Bundled Archivo fonts — only content.js has chrome.runtime.getURL(),
    // so the @font-face declarations (and the src url()s they need) live
    // here, injected into the shadow root's own <style>, never the host
    // page's <head>. popup.html/options.html instead load Archivo from
    // Google Fonts directly (see Plan #35 Design tokens: font delivery
    // differs by context, not by look). manifest.json's
    // web_accessible_resources makes fonts/*.woff2 reachable via this URL
    // even from inside a closed shadow root.
    const style = document.createElement('style');
    const fontLatin = chrome.runtime.getURL('fonts/archivo-latin.woff2');
    const fontLatinExt = chrome.runtime.getURL('fonts/archivo-latin-ext.woff2');
    style.textContent = `
      @font-face {
        font-family: 'Archivo';
        src: url('${fontLatin}') format('woff2');
        font-weight: 400 800;
        font-style: normal;
        font-display: swap;
        unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
      }
      @font-face {
        font-family: 'Archivo';
        src: url('${fontLatinExt}') format('woff2');
        font-weight: 400 800;
        font-style: normal;
        font-display: swap;
        unicode-range: U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;
      }
      @keyframes tak-float {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translateY(-5px) rotate(-2deg); }
      }
      @keyframes tak-nod {
        0%, 100% { transform: rotate(-3deg); }
        50% { transform: rotate(3deg); }
      }
    `;
    shadow.appendChild(style);
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

  // ── Small style helpers (mirror the mockup's .btn/.input classes) ───────

  function styleButton(btn, variant) {
    Object.assign(btn.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: variant === 'ghost' ? 'flex-start' : 'center',
      gap: '6px',
      width: '100%',
      fontFamily: FLUENT_THEME.fontFamily,
      fontWeight: '800',
      fontSize: '14px',
      padding: variant === 'ghost' ? '8px 4px' : '8px 14px',
      border: variant === 'secondary' ? `1px solid ${FLUENT_THEME.divider}` : '1px solid transparent',
      cursor: 'pointer',
      background: variant === 'primary' ? FLUENT_THEME.accent : variant === 'secondary' ? '#fff' : 'transparent',
      color: variant === 'primary' ? FLUENT_THEME.bg : variant === 'ghost' ? FLUENT_THEME.accent : FLUENT_THEME.text,
    });
    return btn;
  }

  function makeButton(label, variant) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    return styleButton(btn, variant);
  }

  function styleInput(el) {
    Object.assign(el.style, {
      display: 'block',
      width: '100%',
      minHeight: '36px',
      padding: '6px 10px',
      fontFamily: FLUENT_THEME.fontFamily,
      fontSize: '14px',
      color: FLUENT_THEME.text,
      background: FLUENT_THEME.surface,
      border: `1px solid ${FLUENT_THEME.divider}`,
      boxSizing: 'border-box',
    });
    return el;
  }

  // English ordinal suffix (1st, 2nd, 3rd, 4th, 11th, 21st, …) — used for the
  // saved-confirmation view's "Nth word saved".
  function ordinal(n) {
    const rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
    switch (n % 10) {
      case 1: return `${n}st`;
      case 2: return `${n}nd`;
      case 3: return `${n}rd`;
      default: return `${n}th`;
    }
  }

  // ── Collapsed selection pill ─────────────────────────────────────────────

  function showIcon(rect, word) {
    removeAll();
    const sh = ensureHost();
    const pill = document.createElement('div');
    const { x, y } = clamp(rect.right - 200, rect.bottom + 4, 200, 56);
    Object.assign(pill.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      background: '#fff',
      border: `2px solid ${FLUENT_THEME.divider}`,
      padding: '10px 14px',
      fontFamily: FLUENT_THEME.fontFamily,
      cursor: 'pointer',
      userSelect: 'none',
    });

    const iconWrap = document.createElement('span');
    iconWrap.innerHTML = takBareSVG(20);
    Object.assign(iconWrap.style, {
      display: 'inline-flex',
      flexShrink: '0',
      // Bare mark + a CSS nod animation on this wrapper — mirrors the
      // mockup's `takNod` keyframe applied to the icon's own <g>, without
      // needing a third theme.js pose helper for it.
      animation: 'tak-nod 1.8s ease-in-out infinite',
      transformOrigin: '50% 60%',
    });
    pill.appendChild(iconWrap);

    const label = document.createElement('span');
    // "Add", not "Save" — matches the expanded card's own "Add to learn" /
    // "Add "word"" button wording one click later in the same flow.
    label.textContent = 'Add';
    Object.assign(label.style, {
      fontWeight: '800',
      fontSize: '13px',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: FLUENT_THEME.text,
    });
    pill.appendChild(label);

    const hint = document.createElement('span');
    hint.textContent = '⌥S';
    Object.assign(hint.style, {
      marginLeft: 'auto',
      fontSize: '12px',
      color: FLUENT_THEME.muted,
    });
    pill.appendChild(hint);

    pill.addEventListener('mousedown', (e) => e.stopPropagation());
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      showCard(rect, word);
    });
    sh.appendChild(pill);
    iconEl = pill;
  }

  // ── Add card ──────────────────────────────────────────────────────────────

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
    // height is content-driven).
    const { x, y } = clamp(rect.left, rect.bottom + 8, 300, 260);
    Object.assign(card.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: '300px',
      background: '#fff',
      color: FLUENT_THEME.text,
      border: `2px solid ${FLUENT_THEME.text}`,
      boxShadow: FLUENT_THEME.shadowLg,
      fontFamily: FLUENT_THEME.fontFamily,
      fontSize: '13px',
      lineHeight: '1.4',
    });
    card.addEventListener('mousedown', (e) => e.stopPropagation());

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '16px',
      borderBottom: `2px solid ${FLUENT_THEME.text}`,
    });
    const iconWrap = document.createElement('span');
    iconWrap.innerHTML = takFloatSVG(38);
    Object.assign(iconWrap.style, { display: 'inline-flex', flexShrink: '0' });
    header.appendChild(iconWrap);

    const titleCol = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = word;
    Object.assign(title.style, {
      fontWeight: '800',
      fontSize: '22px',
      lineHeight: '1.1',
      wordBreak: 'break-word',
    });
    titleCol.appendChild(title);
    header.appendChild(titleCol);
    card.appendChild(header);

    const contentWrap = document.createElement('div');
    Object.assign(contentWrap.style, { padding: '16px', display: 'grid', gap: '12px' });

    const body = document.createElement('div');
    body.textContent = 'Translating…';
    body.style.color = FLUENT_THEME.muted;
    contentWrap.appendChild(body);

    const footer = document.createElement('div');
    Object.assign(footer.style, { display: 'grid', gap: '8px' });
    contentWrap.appendChild(footer);

    card.appendChild(contentWrap);

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
      body.style.color = FLUENT_THEME.muted;
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
      body.style.color = FLUENT_THEME.text;
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
          fontSize: '12px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: FLUENT_THEME.muted,
          marginTop: '2px',
        });
        // Part of the header's title column in the mockup (icon | title +
        // grammar note), not a separate row in the body below.
        titleCol.appendChild(grammarLine);
      }
      if (Array.isArray(t.senses) && t.senses.length > 0) {
        const sensesBox = document.createElement('div');
        sensesBox.style.marginTop = '2px';
        t.senses.forEach((sense, i) => {
          const line = document.createElement('div');
          line.textContent = `${i + 1}. ${sense}`;
          Object.assign(line.style, { fontSize: '12px', color: FLUENT_THEME.text, marginTop: '2px' });
          sensesBox.appendChild(line);
        });
        contentWrap.insertBefore(sensesBox, footer);
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
    styleInput(input);
    input.style.marginTop = '2px';
    input.style.minHeight = '';
    input.style.padding = '4px 6px';
    input.style.background = '#fff';
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
          color: FLUENT_THEME.accent,
          textDecoration: 'underline',
          textDecorationColor: FLUENT_THEME.accent,
          textDecorationThickness: '3px',
        });
        el.appendChild(strong);
      } else if (part) {
        el.appendChild(document.createTextNode(part));
      }
    });
  }

  async function renderFooter(footer, status, word, translated, hasBaseForm, glossInputs, listsResp) {
    footer.innerHTML = '';
    const base = (status && status.base) || 'https://fluent.lt';

    if (!status || !status.connected) {
      const btn = makeButton('Connect Fluent', 'primary');
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
      const btn = makeButton('Upgrade to add', 'primary');
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
      styleInput(selectEl);

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
      'primary'
    );
    if (!activePayload) {
      btn.disabled = true;
    }

    let toggleLink = null;
    if (basePayload && selectedPayload) {
      toggleLink = makeButton(`add "${selectedPayload.lithuanian}" instead`, 'ghost');
      toggleLink.style.fontSize = '12px';
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
        await chrome.storage.local.set({ lastListId: listId });
        await showSaved(res.data, status);
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

  // ── Saved — confirmation state ───────────────────────────────────────────
  // Replaces the whole card (not a button-text swap): one shape for both a
  // genuinely new word (real ordinal, re-read from /me/stats) and an
  // already-added word (its saved location, no ordinal claim) — single
  // "Open list" button, no Undo (Plan #35 — both are the user's explicit
  // call, dropping the mockup's Undo button and its "repeats tomorrow" line,
  // which has no backing data: adding a word creates no review schedule).
  async function showSaved(data, status) {
    if (!cardEl) return;
    const card = cardEl;

    let subtitleText;
    if (data.already_added) {
      subtitleText = data.location ? `Already saved · in "${data.location}"` : 'Already saved';
    } else {
      // NOT getStats' known+learning: adding a word here only creates a
      // WordListItem, never a UserWordProgress row (see
      // backend/routers/extension.py's add_extension_word), so known+learning
      // wouldn't have moved yet and would show a stale ordinal. getLists'
      // per-list word_count is unfiltered by study status and already
      // includes the word this call just added, so it's summed instead.
      const listsResp = await sendMessage({ type: 'getLists' });
      if (cardEl !== card) return; // dismissed or replaced while waiting
      const total = (listsResp && listsResp.ok && Array.isArray(listsResp.data))
        ? listsResp.data.reduce((sum, wl) => sum + (wl.word_count || 0), 0)
        : null;
      subtitleText = total ? `${ordinal(total)} word saved` : 'Word saved';
    }
    if (cardEl !== card) return;

    card.innerHTML = '';

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '16px',
      borderBottom: `2px solid ${FLUENT_THEME.text}`,
    });
    const iconWrap = document.createElement('span');
    iconWrap.innerHTML = takWaveSVG(54);
    Object.assign(iconWrap.style, { display: 'inline-flex', flexShrink: '0' });
    header.appendChild(iconWrap);

    const textCol = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = 'Saved!';
    Object.assign(title.style, { fontWeight: '800', fontSize: '18px' });
    textCol.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.textContent = subtitleText;
    Object.assign(subtitle.style, { fontSize: '13px', color: FLUENT_THEME.muted });
    textCol.appendChild(subtitle);
    header.appendChild(textCol);
    card.appendChild(header);

    const footer = document.createElement('div');
    Object.assign(footer.style, { padding: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' });
    const openBtn = makeButton('Open list', 'secondary');
    openBtn.style.width = 'auto';
    openBtn.addEventListener('click', () => {
      window.open(`${status.base}/dashboard/vocabulary`, '_blank', 'noopener');
    });
    footer.appendChild(openBtn);
    card.appendChild(footer);
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
      lastWord = info.text;
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
      lastWord = info.text;
      showCard(info.rect, info.text);
    }, 0);
  });

  document.addEventListener('mousedown', (e) => {
    if (hostEl && e.composedPath && e.composedPath().includes(hostEl)) return;
    removeAll();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      removeAll();
      return;
    }
    // Real "⌥S" shortcut hint on the collapsed pill: while it's showing (a
    // valid selection is active), Alt+S opens the Add card directly, same as
    // clicking the pill. `e.code` (the physical key) rather than `e.key` —
    // on macOS, Option+S types 'ß', not 's'.
    if (e.altKey && e.code === 'KeyS' && iconEl && lastRect && lastWord) {
      e.preventDefault();
      showCard(lastRect, lastWord);
    }
  });
  window.addEventListener('scroll', () => removeAll(), true);
  window.addEventListener('blur', () => removeAll());
})();
