'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { BACKEND_URL, getToken, resolveListId } from '../../../../../lib/api';
import { useT } from '../../../../../lib/useT';
import { getStarLevel, setStarLevel } from '../../../../../lib/starLevel';
import QuizSession, { type Word } from '../../../components/QuizSession';
import TakChevron from '../../../../../components/TakChevron';
import PageMascot from '../../../../../components/PageMascot';

export default function QuizPage() {
  const { id: _id } = useParams<{ id: string }>();
  const id = resolveListId(_id);
  const router = useRouter();
  const { tr, plural } = useT();

  const [words, setWords] = useState<Word[]>([]);
  const [distractors, setDistractors] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [limitReached, setLimitReached] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [allKnown, setAllKnown] = useState(false);
  const [moreNewAtHigherLevel, setMoreNewAtHigherLevel] = useState(false);
  const [newWordsAtHigherLevel, setNewWordsAtHigherLevel] = useState(0);
  const [reviewFirstDue, setReviewFirstDue] = useState(0);
  // #31: the review-first screen. `offerDue` > 0 means the list has more words waiting than
  // fit in one session and the user has not chosen yet — the session is deliberately NOT
  // fetched until they do, because fetching it spends one of their daily sessions.
  const [offerDue, setOfferDue] = useState(0);
  const [choice, setChoice] = useState<'review' | 'new' | null>(null);

  const loadWords = useCallback((includeKnown = false, mode?: 'review') => {
    setLoading(true);
    setLimitReached(false);
    setEmpty(false);
    setAllKnown(false);
    setMoreNewAtHigherLevel(false);
    setNewWordsAtHigherLevel(0);
    setReviewFirstDue(0);
    const token = getToken();
    const starLevel = getStarLevel();
    const params = `star_level=${starLevel}${includeKnown ? '&include_known=true' : ''}${mode ? `&mode=${mode}` : ''}`;
    fetch(`${BACKEND_URL}/api/lists/${id}/study?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (r.status === 429) { setLimitReached(true); setLoading(false); return null; }
        if (r.status === 404) { router.replace('/dashboard/lists'); return null; }
        return r.json();
      })
      .then((data: {
        words: Word[];
        distractors: Word[];
        all_known?: boolean;
        more_new_at_higher_level?: boolean;
        new_words_at_higher_level?: number;
        review_first?: { due: number } | null;
      } | null) => {
        if (!data) return;
        const ws = Array.isArray(data) ? data : (data.words ?? []);
        const ds = Array.isArray(data) ? [] : (data.distractors ?? []);
        if (!Array.isArray(data)) {
          setMoreNewAtHigherLevel(!!data.more_new_at_higher_level);
          setNewWordsAtHigherLevel(data.new_words_at_higher_level ?? 0);
          setReviewFirstDue(data.review_first?.due ?? 0);
        }
        if (ws.length === 0) {
          if ((data as { all_known?: boolean }).all_known) setAllKnown(true);
          else setEmpty(true);
          setLoading(false);
          return;
        }
        setWords(ws);
        setDistractors(ds);
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }
    // Ask /progress first — it reports the backlog without charging a daily session, so
    // offering the choice is free. Only the chosen session costs one.
    fetch(`${BACKEND_URL}/api/lists/${id}/progress`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { due?: number; session_size?: number } | null) => {
        if (p && (p.due ?? 0) > (p.session_size ?? 10)) { setOfferDue(p.due!); setLoading(false); }
        else loadWords();
      })
      .catch(() => loadWords());  // a failed count must never block studying
  }, [id, loadWords, router]);

  const choose = useCallback((picked: 'review' | 'new') => {
    setChoice(picked);
    setOfferDue(0);
    loadWords(false, picked === 'review' ? 'review' : undefined);
  }, [loadWords]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // #31: offered before the session is fetched, so showing it costs the user nothing.
  // Two buttons on purpose — a single "Повторить" would be a block, and it would land on
  // exactly the people who just came back from a break and have the biggest backlog.
  if (offerDue > 0) {
    return (
      <main className="flex-1 text-gray-900 flex flex-col items-center justify-center px-8 pt-5 pb-20">
        <div className="relative z-10 flex flex-col items-center text-center max-w-sm w-full gap-5">
          {/* Neutral mood on purpose: at any other mood PageMascot replaces the page's own
              phrase with a canned reaction ("Šaunu!"), and this screen is a nudge, not a cheer. */}
          <PageMascot phrase="Pakartokime!" />
          <h1 className="text-[26px] font-bold" data-testid="review-first-title">{tr.study.reviewFirstTitle}</h1>
          <p className="text-[15px] text-muted mb-2">
            {plural(offerDue, tr.study.reviewFirstBody).replace('{count}', String(offerDue))}
          </p>
          <Link
            href="/dashboard/articles/why-review-beats-new-words"
            className="text-[13.5px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors -mt-1"
          >
            {tr.study.reviewFirstWhy} <TakChevron size={10} className="inline-block align-[-1px]" />
          </Link>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => choose('review')}
              data-testid="review-first-accept"
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 rounded-[10px] text-[15px] font-semibold text-white transition-colors"
            >
              {plural(offerDue, tr.study.reviewFirstCta).replace('{count}', String(offerDue))}
            </button>
            <button
              onClick={() => choose('new')}
              data-testid="review-first-skip"
              className="w-full py-3.5 border border-[#ddd] bg-white hover:border-ink rounded-[10px] text-[15px] font-semibold text-ink transition-colors"
            >
              {tr.study.reviewFirstSkip}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (limitReached) {
    return (
      <main className="flex-1 text-gray-900 flex flex-col items-center justify-center px-8 pt-5 pb-20">
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">⏳</div>
          <h1 className="font-headline text-2xl font-bold mb-2">{tr.common.limitTitle}</h1>
          <p className="text-gray-400 mb-8">{tr.common.limitBody}</p>
          <div className="flex flex-col gap-3">
            <Link href="/pricing" className="w-full py-3 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors text-center">
              {tr.common.getPremium} <TakChevron size={10} className="inline-block align-[-1px]" />
            </Link>
            <button
              onClick={() => router.push('/dashboard/lists')}
              className="w-full py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center"
            >
              {tr.study.backToLists}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (empty) {
    return (
      <main className="flex-1 text-gray-900 flex flex-col items-center justify-center px-8 pt-5 pb-20">
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">★</div>
          <p className="text-gray-400 mb-8">{tr.lists.noWordsAtLevel}</p>
          <button
            onClick={() => router.push('/dashboard/lists')}
            className="w-full py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center"
          >
            <TakChevron direction="left" size={10} className="inline-block align-[-1px] mr-1" />{tr.study.backToLists}
          </button>
        </div>
      </main>
    );
  }

  if (allKnown) {
    const currentLevel = getStarLevel();
    const nextLevel = currentLevel < 3 ? currentLevel + 1 : null;
    return (
      <main className="flex-1 text-gray-900 flex flex-col items-center justify-center px-8 pt-5 pb-20">
        <div className="relative z-10 flex flex-col items-center text-center max-w-sm w-full gap-5">
          <PageMascot phrase="Valio!" mood={1} />
          <h1 className="text-[26px] font-bold">{'★'.repeat(currentLevel)} {tr.study.levelComplete}</h1>
          <p className="text-[15px] text-muted mb-2">{tr.study.levelCompleteBody}</p>
          <div className="flex flex-col gap-3 w-full">
            {nextLevel && (
              <button
                onClick={() => { setStarLevel(nextLevel); router.push('/dashboard/lists'); }}
                className="w-full py-3.5 bg-ink hover:bg-[#25282d] rounded-[10px] text-[15px] font-semibold text-white transition-colors"
              >
                {tr.study.advanceToLevel.replace('{stars}', '★'.repeat(nextLevel))}
              </button>
            )}
            <button
              onClick={() => loadWords(true)}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 rounded-[10px] text-[15px] font-semibold text-white transition-colors"
            >
              {tr.study.studyAgain}
            </button>
          </div>
          <button
            onClick={() => router.push('/dashboard/lists')}
            className="text-[13.5px] text-muted hover:text-gray-900 transition-colors mt-2"
          >
            <TakChevron direction="left" size={10} className="inline-block align-[-1px] mr-1" />{tr.study.backToLists}
          </button>
        </div>
      </main>
    );
  }

  const currentStarLevel = getStarLevel();
  const nextStarLevel = currentStarLevel < 3 ? currentStarLevel + 1 : null;

  return (
    <>
      {/* Both strips sit *above* QuizSession, which paints its own `bg-slate-50` over the
          body's green gradient (globals.css). Without this wrapper the strip's row shows
          that gradient and reads as a coloured band seamed against the session below. */}
      <div className="bg-slate-50">
        {moreNewAtHigherLevel && nextStarLevel && (
        <div className="max-w-2xl mx-auto px-6 pt-4">
          <div
            className="flex flex-wrap items-center justify-between gap-3 border border-line rounded-[14px] px-5 py-3.5 mb-2"
            data-testid="more-new-at-higher-level-banner"
          >
            <p className="text-[13.5px] text-ink">
              {tr.study.moreNewAtHigherLevel
                .replace('{count}', String(newWordsAtHigherLevel))
                .replace('{stars}', '★'.repeat(nextStarLevel))}
            </p>
            <button
              onClick={() => { setStarLevel(nextStarLevel); loadWords(); }}
              className="shrink-0 text-[13px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              {tr.study.advanceToLevel.replace('{stars}', '★'.repeat(nextStarLevel))}
            </button>
          </div>
        </div>
      )}
        {choice === 'new' && reviewFirstDue > 0 && (
        <div className="max-w-2xl mx-auto px-6 pt-4">
          <div
            className="flex flex-wrap items-center justify-between gap-3 border border-line rounded-[14px] px-5 py-3.5 mb-2"
            data-testid="review-first-banner"
          >
            <p className="text-[13.5px] text-ink">
              {plural(reviewFirstDue, tr.study.reviewFirst).replace('{count}', String(reviewFirstDue))}
            </p>
            <Link
              href="/dashboard/articles/why-review-beats-new-words"
              className="shrink-0 text-[13px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              {tr.study.reviewFirstWhy} <TakChevron size={10} className="inline-block align-[-1px]" />
            </Link>
          </div>
        </div>
        )}
      </div>
      <QuizSession
        words={words}
        distractors={distractors}
        sessionMode="study"
        backHref="/dashboard/lists"
        onRepeat={loadWords}
      />
    </>
  );
}
