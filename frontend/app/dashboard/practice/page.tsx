'use client';

// #55 — Практика in the #53 bento layout. Guests see the same page as "no programs"
// (categories + tests are readable without a token); enrolling sends them to /login.
// Presentational pieces: components/PracticeOverview.tsx + components/BentoParts.tsx.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BACKEND_URL, getToken, getPracticeCategories, getPracticeCategoryTests,
  enrollPracticeCategory, unenrollPracticeCategory, type PracticeCategorySummary,
} from '../../../lib/api';
import { useT } from '../../../lib/useT';
import PageMascot from '../../../components/PageMascot';
import PageShell from '../components/PageShell';
import { BENTO_GRID, BentoChips, ConfirmDialog, ErrorLine } from '../components/BentoParts';
import {
  PracticeFeaturedCard, PracticeHero, PracticeSections, PracticeStack, categoryName, isTestPassed,
  practiceFeaturedFor, testHref, type TestsByCategory,
} from '../components/PracticeOverview';

export default function PracticePage() {
  const { tr, lang } = useT();
  const t = tr.practice;
  const router = useRouter();

  const [categories, setCategories] = useState<PracticeCategorySummary[]>([]);
  const [byCat, setByCat] = useState<TestsByCategory>({});
  const [premiumUser, setPremiumUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | 'all'>('all');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  // Enroll/unenroll failure line under the chips; cleared on the next action.
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    try {
      const cats = await getPracticeCategories();
      const lists = await Promise.all(cats.map((c) => getPracticeCategoryTests(c.id).catch(() => [])));
      setCategories(cats);
      setByCat(Object.fromEntries(cats.map((c, i) => [c.id, lists[i]])));
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
    // Only labels the «Premium» test buttons; the exam endpoint enforces Premium itself.
    fetch(`${BACKEND_URL}/api/me/quota`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((q) => setPremiumUser(!!q?.premium_active))
      .catch(() => {});
  }, [load]);

  async function handleEnroll(categoryId: number) {
    // Guests go to sign in; OAuth always lands on /dashboard (no return here).
    if (!getToken()) { router.push('/login'); return; }
    setActionError(false);
    try {
      await enrollPracticeCategory(categoryId);
      setCategories((prev) => prev.map((c) => c.id === categoryId ? { ...c, enrolled: true } : c));
      setSelected(categoryId);
    } catch (e) {
      console.error(e);
      setActionError(true);
    }
  }

  async function handleUnenroll(categoryId: number) {
    setActionError(false);
    try {
      await unenrollPracticeCategory(categoryId); // 404 (not enrolled) counts as done
      setCategories((prev) => prev.map((c) => c.id === categoryId ? { ...c, enrolled: false } : c));
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

  const enrolled = categories.filter((c) => c.enrolled);
  const none = enrolled.length === 0;
  const enrolledTests = enrolled.flatMap((c) => byCat[c.id] ?? []);
  const allTests = categories.flatMap((c) => byCat[c.id] ?? []);
  const startCategory = categories[0] ?? null;
  const heroNext = practiceFeaturedFor('all', categories, byCat);
  const featured = practiceFeaturedFor(selected, categories, byCat);
  const finals = enrolled.flatMap((c) =>
    (byCat[c.id] ?? []).filter((x) => x.is_final).map((test) => ({ category: c, test })));
  const confirmCategory = categories.find((c) => c.id === confirmId);

  return (
    <PageShell className="pb-20 flex flex-col gap-5">
      <PracticeHero
        passed={enrolledTests.filter(isTestPassed).length}
        total={enrolledTests.length}
        none={none}
        continueHref={heroNext?.kind === 'next' ? testHref(heroNext.category.id, heroNext.test.id) : null}
        onStart={none && startCategory ? () => handleEnroll(startCategory.id) : null}
        onNavigate={navigate}
      />

      <div>
        <BentoChips
          items={[
            {
              key: 'all', label: t.allChip, count: (none ? allTests : enrolledTests).length,
              active: selected === 'all', testId: 'category-all',
              onClick: () => { setActionError(false); setSelected('all'); },
            },
            ...categories.map((c) => ({
              key: c.id,
              label: categoryName(c, lang),
              count: (byCat[c.id] ?? []).length,
              active: selected === c.id,
              dot: c.enrolled,
              testId: `category-practice-${c.id}`,
              onClick: () => { setActionError(false); setSelected(c.id); },
            })),
          ]}
          more={{ href: '/dashboard/practice/programs', label: t.browseProgramsLink, testId: 'browse-programs-link' }}
        />
        {actionError && <ErrorLine testId="practice-action-error">{t.actionFailed}</ErrorLine>}
      </div>

      {featured ? (
        <>
          <section className={BENTO_GRID}>
            <PracticeFeaturedCard
              featured={featured}
              tests={byCat[featured.category.id] ?? []}
              hideAddFor={none && startCategory ? startCategory.id : null}
              onNavigate={navigate}
              onAdd={handleEnroll}
            />
            <PracticeStack
              categories={categories.filter((c) => c.id !== featured.category.id)}
              finals={finals}
              byCat={byCat}
              onOpen={(id) => { setActionError(false); setSelected(id); }}
              onAdd={handleEnroll}
              onNavigate={navigate}
            />
          </section>
          <PracticeSections
            category={featured.category}
            tests={byCat[featured.category.id] ?? []}
            premiumUser={premiumUser}
            onStart={(test) => navigate(testHref(featured.category.id, test.id))}
            onUnenroll={() => setConfirmId(featured.category.id)}
          />
        </>
      ) : (
        <p className="text-faint text-sm py-8 text-center">{t.noTests}</p>
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
