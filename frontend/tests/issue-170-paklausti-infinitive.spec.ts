import { test, expect } from '@playwright/test';
import { mockStudy, stageOf, type MockWord } from './helpers/studyFlow';

// Issue #170: word ids 5707 (active, linked into list 178) and 4307 (archived
// duplicate) stored the Lithuanian infinitive "to ask" as 'paklausi' — the
// 2nd-person singular future/present form ("you will ask"), not the actual
// infinitive 'paklausti'. Fixed via the admin PATCH endpoint (word 5707) and a
// direct SQL update (archived word 4307, which the admin endpoint 404s on).
//
// A study session drawn live from `/api/lists/178/study` shuffles from all of
// list 178's words and caps the anonymous session at 10, so it cannot
// reliably surface word 5707 in a deterministic Playwright run. Instead this
// test fetches word 5707's *live* data straight from the real backend (the
// same GET /api/lists/178 endpoint backend/tests/test_admin_word_accented_
// validation.py and issue-166's spec use) and then mocks only the study
// session's word queue with that fetched row via the shared `mockStudy`
// helper (same auth/session-mocking pattern as mature-word-type-first.spec.ts)
// so the study UI renders it deterministically. If the DB fix ever regressed,
// this test would fetch the regressed value and fail below.

test.describe('Issue #170 — list 178 study session shows corrected paklausti', () => {
  test('the study session renders paklausti / спросить / ask, not paklausi', async ({ page, request }) => {
    const res = await request.get('http://localhost:8000/api/lists/178');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const words: MockWord[] = data.words ?? [];
    const word = words.find((w) => w.id === 5707);
    expect(word).toBeDefined();

    // Sanity-check the live data really is the fixed value before rendering it.
    expect(word!.lithuanian).toBe('paklausti');
    expect(word!.translation_ru).toBe('спросить');
    expect(word!.translation_en).toBe('ask');
    expect(word!.accented).toBe('pa*klaus*ti');

    await mockStudy(page, [word!]);
    await page.goto('/dashboard/lists/178/study');

    const stage = await stageOf(page);
    expect(stage).toBe('card');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toContain('спросить');
    // The old wrong 2nd-person-singular form must never render.
    expect(bodyText).not.toMatch(/\bpaklausi\b/);
  });
});
