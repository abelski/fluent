'use client';

/**
 * /dashboard/continue — the combined "Продолжить занятие" session.
 *
 * Runs up to three phases back-to-back — words → grammar → phrases — reusing the
 * standalone components untouched (QuizSession / GrammarTaskRunner / PhraseSession),
 * so per-item progress recording (word SM-2, grammar result, phrase SM-2) is
 * identical to the standalone flows.
 *
 * The whole flow costs ONE daily-quota unit: everything comes from a single
 * GET /api/me/continue-session call, which is where the backend charges it. Never
 * re-fetch a phase from /review/known or /phrases/review here — that would either
 * double-charge or hand the client control over the session's size.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getContinueSession,
  getToken,
  saveGrammarLessonResult,
  type ContinuePhase,
  type ContinueGrammarPhase,
  type PhraseStudyItem,
} from '../../../lib/api';
import { useT } from '../../../lib/useT';
import QuizSession, { type Word } from '../components/QuizSession';
import GrammarTaskRunner from '../components/GrammarTaskRunner';
import PhraseSession from '../components/PhraseSession';
import TakChevron from '../../../components/TakChevron';

const HOME_HREF = '/';

export default function ContinueSessionPage() {
  const router = useRouter();
  const { tr } = useT();

  const [loading, setLoading] = useState(true);
  const [limitReached, setLimitReached] = useState(false);
  const [needsEnrollment, setNeedsEnrollment] = useState<ContinuePhase[]>([]);
  const [phases, setPhases] = useState<ContinuePhase[]>([]);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [words, setWords] = useState<Word[]>([]);
  const [grammar, setGrammar] = useState<ContinueGrammarPhase | null>(null);
  const [phrases, setPhrases] = useState<PhraseStudyItem[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    setLimitReached(false);
    setNeedsEnrollment([]);
    getContinueSession()
      .then((data) => {
        if (data.limitReached) { setLimitReached(true); return; }
        // Hard gate: zero enrollment in any category blocks the whole session —
        // checked before the empty-phase case below, which means "enrolled
        // everywhere, nothing due yet" instead of "never enrolled at all".
        if (data.needs_enrollment.length > 0) { setNeedsEnrollment(data.needs_enrollment); return; }
        // The backend already omits empty phases; re-check against the payload so a
        // phase can never render an empty screen.
        setPhases(data.phases.filter((p) =>
          p === 'words' ? data.words.length > 0
          : p === 'grammar' ? data.grammar !== null && data.grammar.tasks.length > 0
          : data.phrases.length > 0,
        ));
        setPhaseIdx(0);
        setWords(data.words);
        setGrammar(data.grammar);
        setPhrases(data.phrases);
      })
      .catch((err) => { console.error('API error:', err); setPhases([]); })
      .finally(() => setLoading(false));
  }, []);

  // One visit = one session. On every other study page the mount fetch is free, so a
  // duplicated effect is harmless; here the GET itself is what charges the daily quota,
  // so a second invocation silently costs the user a second session. React's StrictMode
  // double-invokes mount effects in development, which did exactly that. The latch ties
  // the charge to a real mount; the done-screen "repeat" buttons still call load()
  // directly, where starting (and paying for) a fresh session is the intent.
  const startedRef = useRef(false);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    if (startedRef.current) return;
    startedRef.current = true;
    load();
  }, [load, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (limitReached) {
    return (
      <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">⏳</div>
          <h2 className="font-headline text-2xl font-bold mb-2">{tr.common.limitTitle}</h2>
          <p className="text-gray-400 mb-8">{tr.common.limitBody}</p>
          <div className="flex flex-col gap-3">
            <Link href="/pricing" className="w-full py-3 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors text-center">
              {tr.common.getPremium} <TakChevron size={10} className="inline-block align-[-1px]" />
            </Link>
            <Link
              href="/dashboard/lists"
              className="w-full block py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center"
            >
              <TakChevron direction="left" size={10} className="inline-block align-[-1px] mr-1" />{tr.common.backToLists}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (needsEnrollment.length > 0) {
    const categoryHref: Record<ContinuePhase, string> = {
      words: '/dashboard/lists',
      grammar: '/dashboard/grammar/programs',
      phrases: '/dashboard/phrases',
    };
    const categoryLabel: Record<ContinuePhase, string> = {
      words: tr.continueSession.categoryWords,
      grammar: tr.continueSession.categoryGrammar,
      phrases: tr.continueSession.categoryPhrases,
    };
    return (
      <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full" data-testid="continue-needs-enrollment">
          <div className="text-5xl mb-6">🎯</div>
          <h2 className="font-headline text-2xl font-bold mb-2">{tr.continueSession.gateTitle}</h2>
          <p className="text-gray-400 mb-8">{tr.continueSession.gateBody}</p>
          <div className="flex flex-col gap-3 mb-6">
            {needsEnrollment.map((category) => (
              <Link
                key={category}
                href={categoryHref[category]}
                data-testid={`continue-enroll-${category}`}
                className="w-full py-3 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors text-center"
              >
                {tr.continueSession.gateLinkPrefix} {categoryLabel[category]}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={load}
              data-testid="continue-enroll-retry"
              className="w-full py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center"
            >
              {tr.continueSession.gateRetry}
            </button>
            <Link href="/dashboard/lists" className="w-full block py-1 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center">
              <TakChevron direction="left" size={10} className="inline-block align-[-1px] mr-1" />{tr.common.backToLists}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const phase = phases[phaseIdx];

  if (!phase) {
    return (
      <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full" data-testid="continue-empty">
          <div className="text-5xl mb-6">📭</div>
          <h2 className="font-headline text-2xl font-bold mb-2">{tr.review.nothingTitle}</h2>
          <p className="text-gray-400 mb-8">{tr.continueSession.emptyBody}</p>
          <Link href="/dashboard/lists" className="w-full block py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center">
            <TakChevron direction="left" size={10} className="inline-block align-[-1px] mr-1" />{tr.common.backToLists}
          </Link>
        </div>
      </main>
    );
  }

  const nextPhase: ContinuePhase | undefined = phases[phaseIdx + 1];
  const advance = () => setPhaseIdx((i) => i + 1);
  // Only the last phase in the sequence shows its component's own end-of-session
  // screen; earlier phases hand off to the next one right after their match round.

  if (phase === 'words') {
    return (
      <QuizSession
        words={words}
        sessionMode="review"
        headerLabel={tr.review.knownMode}
        backHref={HOME_HREF}
        onRepeat={load}
        onAdvance={nextPhase ? advance : undefined}
      />
    );
  }

  if (phase === 'grammar' && grammar) {
    return (
      <GrammarTaskRunner
        tasks={grammar.tasks}
        level={grammar.level}
        rules={grammar.rules}
        hint={grammar.hint ?? undefined}
        onExit={() => router.push(HOME_HREF)}
        onFinish={(score, total) => {
          // Same result row the standalone lesson writes — no quota call here.
          saveGrammarLessonResult(grammar.lesson_id, score, total).catch((err) =>
            console.error('API error:', err),
          );
          if (nextPhase) advance(); else router.push(HOME_HREF);
        }}
      />
    );
  }

  if (phase === 'phrases') {
    return (
      <PhraseSession
        phrases={phrases}
        backHref={HOME_HREF}
        onRepeat={load}
        onAdvance={nextPhase ? advance : undefined}
      />
    );
  }

  return null;
}
