# Settings — current behavior

## Purpose
The Settings dashboard page (`/dashboard/settings`) is where a logged-in
student adjusts their own study preferences: vocabulary session size and
new/review mix, phrase session size and mix, shared lesson-mode/complexity/
timer/audio-autoplay preferences, the combined "continue session" phase
sizes, and two account-level preferences (server-recorded language, email
consent). It has no
billing or subscription UI of its own — see `specs/billing.md` for where
premium is bought/managed (`/pricing`) — and the combined-session settings tab
only sets numbers that `specs/continue-session.md` describes in full; this file
only covers what the Settings page itself shows and lets a user do.

Backed by: `frontend/app/dashboard/settings/page.tsx`, plus
`GET/PATCH /me/settings` and `GET/PATCH /me/phrases-settings` (both in
`backend/routers/words.py` / `backend/routers/phrases.py`) and
`GET/PATCH /me/continue-settings` (`backend/routers/continue_session.py`,
see `specs/continue-session.md`).

## Scenarios

```gherkin
Scenario: Page requires login
  Given no auth token in localStorage
  When /dashboard/settings is opened
  Then the page redirects to /login before rendering any tab

Scenario: Four tabs are reachable; two declared tab values are not
  Given the page's Tab type includes vocabulary, grammar, practice, phrases,
    combined, and other
  When the tab bar renders
  Then only four buttons exist — Vocabulary, Phrases, Combined, Other — so
    "grammar" and "practice" can never become the active tab through any UI
    control; reaching either (not currently possible via the rendered UI)
    would show the same generic "nothing here yet" placeholder used for any
    unmatched tab value

Scenario: Vocabulary tab — session size and new/review mix
  Given the Vocabulary tab is active
  Then a slider sets words_per_session (3–50) and another sets the new-vs-
    review ratio (0–100%, in 5% steps), with a live bar showing the resulting
    new/review word counts for the currently configured session size
  When Save is pressed
  Then PATCH /me/settings is called with the full settings object; the
    backend re-validates words_per_session (1–50), new_words_ratio (0.0–1.0),
    lesson_mode, question_timer_seconds (5–30), and lang server-side and
    rejects an out-of-range value with 422 even though the sliders already
    constrain the client-side range

Scenario: Phrases tab — its own session size and mix, on a separate endpoint
  Given the Phrases tab is active
  Then phrases_per_session (3–30) and new_phrases_ratio are controlled by
    their own sliders, saved to /me/phrases-settings (not /me/settings) —
    a materially different range/endpoint from the Vocabulary tab's word
    settings, not just a copy of it

Scenario: Lesson mode, complexity, and timer are shared across the Vocabulary
    and Phrases tabs, not per-category
  Given both tabs render their own copies of the lesson-mode slider, the
    complexity slider, and the question-timer controls
  When any of these is changed on either tab
  Then it writes into the same single `settings` (or localStorage, for
    complexity) state used by both tabs — there is no separate lesson_mode/
    timer value for vocabulary vs. phrases

Scenario: Saving from the Phrases tab also persists the shared fields
  Given the Phrases tab's Save button is pressed
  Then it calls both PATCH /me/phrases-settings (phrases_per_session,
    new_phrases_ratio) AND PATCH /me/settings (the full shared settings
    object, including lesson_mode/timer/lang/email_consent as currently held
    in state) in the same action — so an unsaved edit made earlier on the
    Vocabulary tab's own session-size/ratio sliders is also written to the
    server when the user instead saves from the Phrases tab

Scenario: Complexity preference never reaches the server
  Given the complexity slider (easy/medium/hard) shown on both the Vocabulary
    and Phrases tabs
  When it is changed
  Then it is written only to localStorage ("fluent_complexity") and is not
    part of the UserSettings type or any PATCH body — it never round-trips
    through the backend at all

Scenario: Combined tab — per-phase continue-session sizes
  Given the Combined tab is active
  Then three sliders (1–20 each) set continue_words_count,
    continue_grammar_count, and continue_phrases_count, plus a checkbox for
    continue_include_new
  When Save is pressed
  Then PATCH /me/continue-settings is called and the response is written back
    into local state — see `specs/continue-session.md` for how these values
    size and blend each phase of a combined session

Scenario: Other tab — server-recorded language is separate from the page's
    own display language
  Given the Other tab's language <select> (English/Russian)
  When it is changed and saved via PATCH /me/settings (the `lang` field)
  Then it updates only the server-stored user.lang column, which the backend
    uses for scheduled re-engagement emails and other server-rendered content
    language choices — it does NOT change the language the dashboard itself
    displays in; the site's own displayed language is a separate, purely
    client-side preference (localStorage "fluent_lang", set from a language
    toggle in the shared navbar/Header, unrelated to this settings save)

Scenario: Other tab — email consent
  Given the email-consent checkbox
  When toggled and saved
  Then it updates user.email_consent via the same PATCH /me/settings call as
    the language field, gating whether the backend is allowed to email this
    user at all (checked elsewhere, e.g. before sending a re-engagement or
    admin email)

Scenario: Save feedback uses one flag shared by Vocabulary+Other, and separate
    flags for Phrases and Combined
  Given a save action on the Vocabulary, Phrases, Combined, or Other tab
  When it succeeds
  Then a "saved" message is shown for 3 seconds; the Vocabulary and Other tabs
    both read/set the same `saved` state and both call the same `handleSave`
    (saving one can show a leftover "saved" message on the other if the user
    switches tabs quickly), while Phrases (`phrasesSaved`) and Combined
    (`continueSaved`) each have their own independent flag

Scenario: Save errors share a single message across every tab
  Given a save action on any savable tab fails (non-OK response)
  Then a tab-appropriate error string (different translation key per tab) is
    written into one shared `error` state that every tab's block renders —
    so an error left over from a failed save on one tab is still shown if the
    user switches to another tab without saving there; no partial state is
    rolled back client-side since the fields being edited are just left as
    the user set them

Scenario: Vocabulary tab — audio autoplay toggle, premium/admin-gated
  Given the page has fetched /api/me/quota and the user is not premium and
    not an admin/superadmin
  Then the audio-autoplay checkbox on the Vocabulary tab is disabled, greyed
    out, and shows a "Premium" badge linking to /pricing
  Given the same user is premium (or admin/superadmin)
  Then the checkbox is enabled
  When it is toggled
  Then the value is written only to localStorage ("fluent_audio_autoplay",
    default true) and is never sent to the backend — like complexity, it
    never round-trips through /me/settings; see documentation/audio.md
```
