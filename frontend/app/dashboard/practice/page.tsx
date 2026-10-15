'use client';

// #66 — Практика: overview («В процессе» / «Завершённые» / «Другие программы») and the program
// page on `?program=<id>` (the static export needs no new route). Guests see the same page as
// "no programs" (categories + tests are readable without a token); enrolling sends them to
// /login. Presentational pieces: components/PracticeOverview.tsx + ProgramOverview.tsx.
// See documentation/overview-pages.md.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BACKEND_URL, getToken, getMyPracticeCategories, getPracticeCategories, getPracticeCategoryTests,
  enrollPracticeCategory, unenrollPracticeCategory, type PracticeCategorySummary,
} from '../../../lib/api';
import { useT } from '../../../lib/useT';
import PageMascot from '../../../components/PageMascot';
import PageShell from '../components/PageShell';
import { ConfirmDialog } from '../components/BentoParts';
import { OverviewNotice } from '../components/ProgramOverview';
import {
  PracticeOverviewBody, PracticeOverviewHero, PracticeProgramPage, buildPracticeModel, categoryName, isTestPassed,
  programHref, type TestsByCategory,
} from '../components/PracticeOverview';

export default function PracticePage() {
  // useSearchParams needs a Suspense boundary under static export — same as inbox/page.tsx.
  return (
    <Suspense fallback={<PageShell>{null}</PageShell>}>
      <PracticePageInner />
    </Suspense>
  );
}

function PracticePageInner() {
  const { tr, lang } = useT();
  const t = tr.practice;
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewId = Number(searchParams.get('program')) || null;

  const [categories, setCategories] = useState<PracticeCategorySummary[]>([]);
  const [byCat, setByCat] = useState<TestsByCategory>({});
  const [lastResult, setLastResult] = useState<Record<number, string | null>>({});
  const [premiumUser, setPremiumUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  // The category just added from the catalogue — its page shows «✓ … · Отменить».
  const [justAdded, setJustAdded] = useState<number | null>(null);
  // Enroll/unenroll failure; cleared on the next action.
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cats, mine] = await Promise.all([getPracticeCategories(), getMyPracticeCategories()]);
      const lists = await Promise.all(cats.map((c) => getPracticeCategoryTests(c.id).catch(() => [])));
      setCategories(cats);
      setByCat(Object.fromEntries(cats.map((c, i) => [c.id, lists[i]])));
      // #66 — the latest result per category drives «Пора повторить» and the hero's program.
      setLastResult(Object.fromEntries(mine.map((m) => [m.id, m.last_result_at])));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const token = getToken();
    if (!token) return;
    // Only labels the «Premium» test rows; the exam endpoint enforces Premium itself.
    fetch(`${BACKEND_URL}/api/me/quota`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((q) => setPremiumUser(!!q?.premium_active))
      .catch(() => {});
  }, [load]);

  async function enroll(ids: number[]): Promise<boolean> {
    // Guests go to sign in; OAuth always lands on /dashboard (no return here).
    if (!getToken()) { router.push('/login'); return false; }
    setActionError(false);
    try {
      for (const id of ids) await enrollPracticeCategory(id);
      setCategories((prev) => prev.map((c) => ids.includes(c.id) ? { ...c, enrolled: true } : c));
      load(); // locks and scores come with the enrolled view
      return true;
    } catch (e) {
      console.error(e);
      setActionError(true);
      return false;
    }
  }

  // «Добавить» enrolls and opens the program page with «✓ … теперь в твоих программах».
  async function handleEnroll(categoryId: number) {
    if (await enroll([categoryId])) {
      setJustAdded(categoryId);
      router.push(programHref(categoryId));
    }
  }

  // Undo / «Убрать программу»: unenroll and go back to the overview.
  async function handleUnenroll(categoryId: number) {
    setActionError(false);
    try {
      await unenrollPracticeCategory(categoryId); // 404 (not enrolled) counts as done
      setCategories((prev) => prev.map((c) => c.id === categoryId ? { ...c, enrolled: false } : c));
      setJustAdded(null);
      router.push('/dashboard/practice');
    } catch (e) {
      console.error(e);
      setActionError(true);
    }
  }

  const navigate = (href: string) => router.push(href);

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[32px] font-bold mb-1.5">{t.title}</h1>
          {/* The mascot moves into the hero once it renders — exactly one on screen. */}
          <PageMascot phrase="Pasirinkime!" className="hidden sm:block shrink-0" />
        </div>
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageShell>
    );
  }

  const models = categories.map((c) => buildPracticeModel(c, byCat[c.id] ?? [], lastResult[c.id] ?? null));
  const mine = models.filter((m) => m.category.enrolled);
  const others = models.filter((m) => !m.category.enrolled);
  const none = mine.length === 0;
  const enrolledTests = mine.flatMap((m) => m.tests);
  const cit = models.find((m) => m.exam === 'cit') ?? null;
  const a2 = models.find((m) => m.exam === 'a2') ?? null; // Reading — first A2 category by sort order
  const viewing = mine.find((m) => m.category.id === viewId) ?? null;
  const confirmCategory = categories.find((c) => c.id === confirmId);
  const notice = actionError && <OverviewNotice testId="practice-action-error">{t.actionFailed}</OverviewNotice>;

  return (
    <PageShell className="pb-20 flex flex-col gap-5">
      {viewing ? (
        <PracticeProgramPage
          model={viewing}
          mine={mine}
          justAdded={justAdded === viewing.category.id}
          premiumUser={premiumUser}
          onUndo={() => handleUnenroll(viewing.category.id)}
          onRemove={() => setConfirmId(viewing.category.id)}
          onNavigate={navigate}
          notice={notice}
        />
      ) : (
        <>
          <PracticeOverviewHero
            mine={mine}
            passed={enrolledTests.filter(isTestPassed).length}
            total={enrolledTests.length}
            none={none}
            onNavigate={navigate}
            onStartCit={none && cit ? () => handleEnroll(cit.category.id) : null}
            onStartA2={none && a2 ? () => handleEnroll(a2.category.id) : null}
          />
          {notice}
          {models.length === 0 ? (
            <p className="text-faint text-sm py-8 text-center">{t.noTests}</p>
          ) : (
            <PracticeOverviewBody
              mine={mine}
              others={others}
              none={none}
              onAdd={handleEnroll}
              onAddAll={(ids) => { enroll(ids); }}
              onNavigate={navigate}
            />
          )}
        </>
      )}

      {confirmCategory && (
        <ConfirmDialog
          title={tr.lists.removeProgramTitle.replace('{label}', categoryName(confirmCategory, lang))}
          body={tr.lists.removeProgramBody}
          cancelLabel={tr.common.cancel}
          confirmLabel={tr.lists.removeProgramConfirm}
          onCancel={() => setConfirmId(null)}
          onConfirm={() => { setConfirmId(null); handleUnenroll(confirmCategory.id); }}
        />
      )}
    </PageShell>
  );
}
