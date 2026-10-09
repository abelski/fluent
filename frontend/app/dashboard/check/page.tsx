'use client';

/**
 * /dashboard/check — knowledge check (#62a) and, with `?gaps=1`, the Premium
 * «Close the gaps» run. See documentation/knowledge-check.md.
 *
 * The server owns the answers: the check is graded by POST …/answers from the picked
 * option strings; the gaps run is saved like remind (lesson id 0).
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ApiCodeError,
  getGapTasks,
  getKnowledgeCheck,
  saveGrammarLessonResult,
  startKnowledgeCheck,
  submitKnowledgeCheck,
  type KnowledgeCheckResult,
  type KnowledgeCheckTopic,
} from '../../../lib/api';
import { useT } from '../../../lib/useT';
import GrammarTaskRunner, { type Task } from '../components/GrammarTaskRunner';
import PageMascot from '../../../components/PageMascot';
import Tak from '../../../components/Tak';

const INK_BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-ink text-white px-5 py-2.5 text-sm font-semibold';

type View = 'loading' | 'run' | 'result' | 'premium' | 'error';

export default function KnowledgeCheckPage() {
  const router = useRouter();
  const { tr, lang } = useT();
  const t = tr.knowledgeCheck;
  const [view, setView] = useState<View>('loading');
  const [gaps, setGaps] = useState(false);
  const [error, setError] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [checkId, setCheckId] = useState<number | null>(null);
  const [result, setResult] = useState<KnowledgeCheckResult | null>(null);
  const [premium, setPremium] = useState(false);
  const responses = useRef<(string | null)[]>([]);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const isGaps = new URLSearchParams(window.location.search).get('gaps') === '1';
    setGaps(isGaps);
    const fail = (e: unknown) => {
      if (e instanceof ApiCodeError && e.code === 'premium_required') return setView('premium');
      setError(e instanceof ApiCodeError && e.code === 'no_gaps' ? t.noGapsError : t.loadError);
      setView('error');
    };
    if (isGaps) {
      getGapTasks().then((ts) => { setTasks(ts); setView('run'); }).catch(fail);
    } else {
      getKnowledgeCheck().then((s) => setPremium(s.is_premium)).catch(() => {});
      startKnowledgeCheck()
        .then(({ id, tasks: ts }) => {
          responses.current = ts.map(() => null);
          setCheckId(id);
          setTasks(ts);
          setView('run');
        })
        .catch(fail);
    }
  }, [t]);

  const home = () => router.push('/');

  async function finish(score: number, total: number) {
    if (gaps) {
      await saveGrammarLessonResult(0, score, total).catch(() => {});
      home();
      return;
    }
    if (checkId === null) return;
    try {
      setResult(await submitKnowledgeCheck(checkId, responses.current));
      setView('result');
    } catch {
      setError(t.loadError);
      setView('error');
    }
  }

  if (view === 'run') {
    return (
      <GrammarTaskRunner
        tasks={tasks}
        level="basic"
        rules={[]}
        exitLabel={t.back}
        onExit={home}
        onAnswer={(i, r) => { responses.current[i] = r; }}
        onFinish={(score, total) => { finish(score, total); }}
      />
    );
  }

  const title = (r: KnowledgeCheckTopic) => (lang === 'en' ? r.title_en : r.title_ru);

  return (
    <main className="min-h-screen text-ink px-6 py-8">
      <div className="max-w-lg w-full mx-auto flex flex-col gap-4">
        {view === 'loading' && <p className="text-center text-sm text-muted">…</p>}

        {view === 'error' && (
          <section className="bg-white border border-line rounded-[14px] p-6 flex flex-col gap-3 text-center" data-testid="check-error">
            <p className="text-sm text-ink">{error}</p>
            <Link href="/" className={`${INK_BTN} w-full`}>{t.back}</Link>
          </section>
        )}

        {view === 'premium' && (
          <div className="flex flex-col items-center gap-4 text-center" data-testid="check-premium">
            <Tak bare size={64} />
            <section className="w-full bg-white border border-line rounded-[14px] p-6 flex flex-col gap-3">
              <h1 className="text-lg font-bold text-ink">{t.premiumTitle}</h1>
              <p className="text-sm text-ink leading-snug">{t.premiumText}</p>
              <Link href="/pricing" className={`${INK_BTN} w-full`}>{t.upsellLink} <span aria-hidden="true">›</span></Link>
              <Link href="/" className="text-sm text-muted">{t.back}</Link>
            </section>
          </div>
        )}

        {view === 'result' && result && (() => {
          const weak = result.topics.filter((r) => r.weak);
          const strong = result.topics.filter((r) => !r.weak);
          const row = (r: KnowledgeCheckTopic) => (
            <li key={r.topic} className="flex items-center gap-3 py-2.5 border-t border-line-soft first:border-t-0" data-testid="result-row">
              <span className="flex-1 min-w-0 text-sm text-ink">{title(r)}</span>
              <span className="text-sm tabular-nums text-muted">{r.correct}/{r.total}</span>
              <span className={`shrink-0 w-[76px] text-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.weak ? 'bg-destructive/10 text-destructive' : 'bg-emerald-50 text-emerald-700'}`}>
                {r.weak ? t.weak : t.strong}
              </span>
            </li>
          );
          const heading = 'text-xs font-semibold text-gray-400 uppercase tracking-wide';
          return (
            <div className="flex flex-col gap-4" data-testid="check-result">
              <div className="flex flex-col items-center gap-2 text-center">
                <PageMascot phrase="Gerai!" size={64} />
                <h1 className="mt-2 text-2xl font-bold text-ink">{t.resultTitle}</h1>
                <p className="text-base text-ink">
                  {t.resultScore.replace('{correct}', String(result.correct)).replace('{total}', String(result.total))}
                </p>
                <p className="text-xs text-muted">{t.resultSub}</p>
              </div>
              <section className="bg-white border border-line rounded-[14px] px-5 py-3">
                {weak.length > 0 && (
                  <>
                    <p className={`mt-1 mb-1 ${heading}`}>{t.weakHeading}</p>
                    <ul>{weak.map(row)}</ul>
                  </>
                )}
                {strong.length > 0 && (
                  <>
                    <p className={`${weak.length ? 'mt-3' : 'mt-1'} mb-1 ${heading}`}>{t.strongHeading}</p>
                    <ul>{strong.map(row)}</ul>
                  </>
                )}
              </section>
              {!premium && (
                <p className="text-sm text-ink text-center">
                  {t.resultUpsell}{' '}
                  <Link href="/pricing" className="font-semibold text-emerald-600">{t.upsellLink} <span aria-hidden="true">›</span></Link>
                </p>
              )}
              <Link href="/" className={`${INK_BTN} w-full`} data-testid="check-home">{t.back}</Link>
            </div>
          );
        })()}
      </div>
    </main>
  );
}
