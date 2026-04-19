// Shared API utilities used across all frontend pages.
//
// BACKEND_URL is injected at build time via NEXT_PUBLIC_BACKEND_URL so it can
// differ between local development (localhost:8000) and production (same origin).

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

/**
 * Read the JWT from localStorage.
 * The token is stored by the dashboard page after a successful Google OAuth login
 * (backend redirects to /dashboard?token=<jwt> and the page picks it up).
 * Returns null during SSR (window is undefined) or when the user is logged out.
 */
export function getToken(): string | null {
  return typeof window !== 'undefined'
    ? localStorage.getItem('fluent_token')
    : null;
}

/**
 * Resolve the real numeric list ID from the current browser URL.
 *
 * Problem: Next.js static export replaces dynamic route segments like [id] with '_'
 * in the output filenames (e.g. out/dashboard/lists/_/study/index.html).
 * At runtime, useParams() therefore returns '_' instead of the real ID.
 *
 * Solution: the real ID is still in window.location.pathname (the browser URL),
 * so we look for the numeric segment that follows "lists" in the path.
 *
 * Example: /dashboard/lists/42/study → "42"
 */
export function resolveListId(_id: string): string {
  if (typeof window !== 'undefined' && !/^\d+$/.test(_id)) {
    return (
      window.location.pathname
        .split('/')
        .find((s, i, a) => a[i - 1] === 'lists' && /^\d+$/.test(s)) ?? _id
    );
  }
  return _id;
}

export interface UserSettings {
  words_per_session: number;
  new_words_ratio: number;  // 0.0–1.0
  lesson_mode: 'thorough' | 'quick';
  use_question_timer: boolean;
  question_timer_seconds: number;  // 5–30
  email_consent: boolean;  // default: true
  lang: 'en' | 'ru';
}

export async function getSettings(): Promise<UserSettings> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/settings`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error('Failed to load settings');
  return r.json();
}

export async function updateSettings(data: UserSettings): Promise<UserSettings> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error('Failed to save settings');
  return r.json();
}

/** Send an email to a user. Superadmin-only. Throws if the user has not consented or SMTP is not configured. */
export async function sendEmailToUser(userId: string, subject: string, body: string): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/admin/users/${userId}/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ subject, body }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.detail || 'Failed to send email');
  }
}

/** Return subcategory keys the current user is enrolled in. */
export async function getEnrolledPrograms(): Promise<string[]> {
  const token = getToken();
  if (!token) return [];
  const r = await fetch(`${BACKEND_URL}/api/me/programs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  return r.json();
}

/** Enroll the current user in a program (subcategory). Throws on network error. */
export async function enrollProgram(subcategory: string): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/programs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ subcategory }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to enroll');
  }
}

/** Unenroll the current user from a program (subcategory). Throws on network error. */
export async function unenrollProgram(subcategory: string): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/programs/${encodeURIComponent(subcategory)}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to unenroll');
  }
}

// ── Community (custom) programs ───────────────────────────────────────────────

export interface CustomProgramSummary {
  id: number;
  title: string;
  title_en: string | null;
  description: string | null;
  description_en: string | null;
  lang_ru: boolean;
  lang_en: boolean;
  created_by: string;
  author_name: string | null;
  share_token: string;
  is_published: boolean;
  created_at: string;
  list_ids: number[];
  word_count: number;
  enrollment_count: number;
}

export interface CustomProgramEnrollment {
  id: number;
  title: string;
  share_token: string;
  list_ids: number[];
}

export interface WordPair {
  front: string;
  back_ru: string;
  back_en: string;
}

export interface WordSet {
  title: string;
  words: WordPair[];
}

export interface WordSetWithId {
  id: number;
  title: string;
  words: WordPair[];
}

export async function getCommunityPrograms(): Promise<CustomProgramSummary[]> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/programs/community`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) return [];
  return r.json();
}

export async function getCommunityProgram(shareToken: string): Promise<CustomProgramSummary> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/programs/community/${encodeURIComponent(shareToken)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error('Program not found');
  return r.json();
}

export async function getMyCustomPrograms(): Promise<CustomProgramSummary[]> {
  const token = getToken();
  if (!token) return [];
  const r = await fetch(`${BACKEND_URL}/api/me/custom-programs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  return r.json();
}

export async function createCustomProgram(data: {
  title: string;
  title_en?: string;
  description?: string;
  description_en?: string;
  lang_ru: boolean;
  lang_en: boolean;
  word_sets: WordSet[];
}): Promise<CustomProgramSummary> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/custom-programs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to create program');
  }
  return r.json();
}

export async function updateCustomProgram(
  id: number,
  data: {
    title?: string;
    title_en?: string;
    description?: string;
    description_en?: string;
    lang_ru?: boolean;
    lang_en?: boolean;
    word_sets?: WordSet[];
  },
): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/custom-programs/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to update program');
  }
}

export async function getCommunityProgramWordSets(shareToken: string): Promise<WordSetWithId[]> {
  const token = getToken();
  if (!token) return [];
  const r = await fetch(`${BACKEND_URL}/api/programs/community/${encodeURIComponent(shareToken)}/word-sets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  return r.json();
}

export async function getCustomProgramWordSets(programId: number): Promise<WordSetWithId[]> {
  const token = getToken();
  if (!token) return [];
  const r = await fetch(`${BACKEND_URL}/api/me/custom-programs/${programId}/word-sets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  return r.json();
}

export async function deleteCustomProgram(id: number): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/custom-programs/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to delete program');
  }
}

export async function getCustomProgramEnrollments(): Promise<CustomProgramEnrollment[]> {
  const token = getToken();
  if (!token) return [];
  const r = await fetch(`${BACKEND_URL}/api/me/custom-program-enrollments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  return r.json();
}

export async function enrollCustomProgram(shareToken: string): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/custom-program-enrollments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ share_token: shareToken }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to enroll');
  }
}

export async function unenrollCustomProgram(programId: number): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/custom-program-enrollments/${programId}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to unenroll');
  }
}

// ── Phrases feature ───────────────────────────────────────────────────────────

export interface PhraseProgramSummary {
  id: number;
  title: string;
  title_en: string | null;
  description: string | null;
  description_en: string | null;
  difficulty: number;
  phrase_count: number;
  enrolled: boolean;
  stage_distribution: { stage0: number; stage1: number; stage2: number } | null;
}

export interface PhraseStudyItem {
  id: number;
  text: string;
  translation: string;
  translation_en: string | null;
  lesson_stage: number;      // 0=intro, 1=fill-word, 2=type-full
  blank_word: string;
  mcq_distractors: string[];
  next_review: string | null;
}

export interface PhraseStudySession {
  phrases: PhraseStudyItem[];
}

export async function getPhrasePrograms(): Promise<PhraseProgramSummary[]> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/phrase-programs`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) return [];
  return r.json();
}

export async function enrollPhraseProgram(programId: number): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/phrase-programs/${programId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to enroll');
  }
}

export async function unenrollPhraseProgram(programId: number): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/phrase-programs/${programId}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to unenroll');
  }
}

export async function getPhrasesStudy(programId: number, chapter?: number): Promise<PhraseStudySession> {
  const token = getToken();
  const url = chapter !== undefined
    ? `${BACKEND_URL}/api/phrase-programs/${programId}/study?chapter=${chapter}`
    : `${BACKEND_URL}/api/phrase-programs/${programId}/study`;
  const r = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to load study session');
  }
  return r.json();
}

export async function recordPhraseProgress(
  phraseId: number,
  payload: { quality: number; stage_completed: number; mistake_word?: string },
): Promise<{ lesson_stage: number; next_review: string | null; interval: number }> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/phrases/${phraseId}/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to record progress');
  }
  return r.json();
}

export async function getPhrasesSettings(): Promise<{ phrases_per_session: number }> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/phrases-settings`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error('Failed to load phrases settings');
  return r.json();
}

export async function updatePhrasesSettings(phrasesPerSession: number): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/phrases-settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ phrases_per_session: phrasesPerSession }),
  });
  if (!r.ok) throw new Error('Failed to save phrases settings');
}

// Admin phrase helpers
export async function adminGetPhrasePrograms(): Promise<(PhraseProgramSummary & { is_public: boolean; enrolled_count: number; created_at: string })[]> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/admin/phrase-programs`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error('Failed to load phrase programs');
  return r.json();
}

export async function adminCreatePhraseProgram(data: {
  title: string; title_en?: string; description?: string; description_en?: string;
  difficulty: number; is_public: boolean;
}): Promise<{ id: number; title: string }> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/admin/phrase-programs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { detail?: string }).detail ?? 'Failed'); }
  return r.json();
}

export async function adminUpdatePhraseProgram(id: number, data: {
  title: string; title_en?: string; description?: string; description_en?: string;
  difficulty: number; is_public: boolean;
}): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/admin/phrase-programs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { detail?: string }).detail ?? 'Failed'); }
}

export async function adminDeletePhraseProgram(id: number): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/admin/phrase-programs/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { detail?: string }).detail ?? 'Failed'); }
}

export interface AdminPhrase { id: number; text: string; translation: string; position: number; }

export async function adminGetPhrases(programId: number): Promise<AdminPhrase[]> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/admin/phrase-programs/${programId}/phrases`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) return [];
  return r.json();
}

export async function adminCreatePhrase(programId: number, data: { text: string; translation: string; position: number }): Promise<AdminPhrase> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/admin/phrase-programs/${programId}/phrases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { detail?: string }).detail ?? 'Failed'); }
  return r.json();
}

export async function adminUpdatePhrase(phraseId: number, data: { text: string; translation: string; position: number }): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/phrases/${phraseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { detail?: string }).detail ?? 'Failed'); }
}

export async function adminDeletePhrase(phraseId: number): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/phrases/${phraseId}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { detail?: string }).detail ?? 'Failed'); }
}

export async function adminGetPhraseProgramStats(programId: number): Promise<{
  enrolled_count: number;
  stage_distribution: { stage0: number; stage1: number; stage2: number };
}> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/admin/phrase-programs/${programId}/stats`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error('Failed to load stats');
  return r.json();
}

export async function getPhraseReview(): Promise<PhraseStudySession> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/phrases/review`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to load review session');
  }
  return r.json();
}

/**
 * Resolve the real numeric phrase program ID from the current browser URL.
 * Mirrors resolveListId() — handles Next.js static export '_' placeholder.
 */
export function resolvePhraseId(_id: string): string {
  if (typeof window !== 'undefined' && !/^\d+$/.test(_id)) {
    return (
      window.location.pathname
        .split('/')
        .find((s, i, a) => a[i - 1] === 'phrases' && /^\d+$/.test(s)) ?? _id
    );
  }
  return _id;
}
