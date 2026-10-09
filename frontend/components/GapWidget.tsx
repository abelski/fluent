'use client';

// #62a — «Работа над ошибками» / "Work on mistakes" on the signed-in home, between
// <Leaderboard /> and <EffortRadar />. Three states: no check yet → CTA; free after
// the check → weak topics + upsell; Premium → «Close the gaps» / «Recommendations»
// tabs. Gating lives on the server (GET /api/me/knowledge-check); see
// documentation/knowledge-check.md.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  enrollGrammarProgram,
  enrollPracticeCategory,
  getKnowledgeCheck,
  getToken,
  type KnowledgeCheckState,
} from '../lib/api';
import { useT } from '../lib/useT';
import Tak from './Tak';

const INK_BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-ink text-white px-5 py-2.5 text-sm font-semibold';
const CHIP = 'inline-flex items-center rounded-full bg-destructive/10 text-destructive px-3 py-1 text-[13px] font-medium';
const EMPTY_BOX = 'text-[13px] text-muted bg-[#f2f3f3] rounded-[10px] px-3 py-2';
const Chev = () => <span aria-hidden="true">›</span>;

export default function GapWidget() {
  const { tr, lang } = useT();
  const t = tr.knowledgeCheck;
  const [data, setData] = useState<KnowledgeCheckState | null>(null);
  const [tab, setTab] = useState<'gaps' | 'recs'>('gaps');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    getKnowledgeCheck().then(setData).catch(() => setData(null));
  }, []);

  if (!getToken() || !data) return null;

  const pick = (ru: string, en: string) => (lang === 'en' ? en : ru);
  const latest = data.latest;
  const header = (
    <p id="gap-title" className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.title}</p>
  );

  let body: React.ReactNode;
  if (!latest) {
    body = (
      <>
        <div className="flex items-center gap-3">
          <div className="shrink-0"><Tak bare size={40} /></div>
          <p className="text-sm leading-snug text-ink">{t.pitch}</p>
        </div>
        <Link href="/dashboard/check" data-testid="gap-start" className={`${INK_BTN} w-full`}>{t.start} <Chev /></Link>
      </>
    );
  } else {
    const weak = latest.topics
      .filter((r) => r.weak)
      .sort((a, b) => a.correct / a.total - b.correct / b.total);
    const date = new Date(latest.created_at.endsWith('Z') ? latest.created_at : latest.created_at + 'Z')
      .toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'long' });
    const meta = (
      <span className="text-xs text-muted" data-testid="gap-meta">
        {t.checked.replace('{date}', date).replace('{correct}', String(latest.correct)).replace('{total}', String(latest.total))}
      </span>
    );
    const chips = (
      <div className="flex flex-wrap gap-1.5" data-testid="gap-chips">
        {weak.map((r) => <span key={r.topic} className={CHIP}>{pick(r.title_ru, r.title_en)}</span>)}
      </div>
    );
    const noGaps = <p className={EMPTY_BOX} data-testid="gap-none">{t.noGaps}</p>;

    if (!data.is_premium) {
      body = (
        <>
          {meta}
          {weak.length ? (<><p className="text-xs font-semibold text-ink">{t.weakLabel}</p>{chips}</>) : noGaps}
          <div className="border-t border-line-strong pt-3 flex flex-col gap-1.5" data-testid="gap-upsell">
            <p className="text-sm leading-snug text-ink">{t.upsell}</p>
            <Link href="/pricing" className="text-sm font-semibold text-emerald-600">{t.upsellLink} <Chev /></Link>
          </div>
        </>
      );
    } else {
      const recs = data.recommendations ?? [];
      const tabBtn = (key: 'gaps' | 'recs', label: string) => (
        <button
          type="button"
          role="tab"
          aria-selected={tab === key}
          data-testid={`gap-tab-${key}`}
          onClick={() => setTab(key)}
          className={`flex-1 text-center px-3 py-2 text-[13px] rounded-full whitespace-nowrap ${
            tab === key ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-muted hover:text-gray-700'
          }`}
        >
          {label}
        </button>
      );
      async function enroll(kind: 'grammar' | 'practice', id: number) {
        const key = `${kind}:${id}`;
        setBusy(key);
        try {
          await (kind === 'grammar' ? enrollGrammarProgram(id) : enrollPracticeCategory(id));
          setData((d) => d && {
            ...d,
            recommendations: d.recommendations?.map((r) => (r.kind === kind && r.id === id ? { ...r, enrolled: true } : r)),
          });
        } catch { /* leave the button as is */ }
        setBusy(null);
      }
      body = (
        <>
          {meta}
          <div className="flex bg-[#f2f3f3] rounded-full p-1 gap-1" role="tablist">
            {tabBtn('gaps', t.tabGaps)}
            {tabBtn('recs', t.tabRecs)}
          </div>
          {tab === 'gaps' ? (
            weak.length ? (
              <>
                <p className="text-sm leading-snug text-ink">{t.gapsLead}</p>
                {chips}
                <Link href="/dashboard/check?gaps=1" data-testid="gap-go" className={`${INK_BTN} w-full`}>{t.go} <Chev /></Link>
              </>
            ) : (
              <>
                {noGaps}
                <button type="button" disabled data-testid="gap-go" className={`${INK_BTN} w-full opacity-40 cursor-not-allowed`}>{t.go} <Chev /></button>
              </>
            )
          ) : (
            <>
              <p className="text-sm leading-snug text-ink">{recs.length ? t.recsLead : t.recsEmpty}</p>
              <ul className="flex flex-col" data-testid="gap-recs">
                {recs.map((r, i) => (
                  <li key={`${r.kind}:${r.id}`} className={`flex items-center gap-3 py-2.5 ${i ? 'border-t border-line-soft' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                        {r.kind === 'grammar' ? t.kindGrammar : t.kindPractice}
                      </p>
                      <p className="text-sm font-semibold text-ink">{pick(r.title_ru, r.title_en)}</p>
                      <p className="text-xs text-muted">{t.because}{r.reasons.map((x) => pick(x.title_ru, x.title_en)).join(', ')}</p>
                    </div>
                    {r.enrolled ? (
                      <span data-testid="gap-enrolled" className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1.5 text-[13px] font-semibold">
                        ✓ {t.enrolled}
                      </span>
                    ) : (
                      <button
                        type="button"
                        data-testid="gap-enroll"
                        disabled={busy === `${r.kind}:${r.id}`}
                        onClick={() => enroll(r.kind, r.id)}
                        className="shrink-0 rounded-[10px] border border-ink bg-white text-ink px-3.5 py-1.5 text-[13px] font-semibold disabled:opacity-40"
                      >
                        {t.enroll}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link href="/dashboard/check" data-testid="gap-again" className="text-sm font-semibold text-emerald-600 self-start">{t.again} <Chev /></Link>
        </>
      );
    }
  }

  return (
    <section data-testid="gap-widget" aria-labelledby="gap-title" className="bg-white rounded-[14px] border border-line p-5 mb-4 flex flex-col gap-3">
      {header}
      {body}
    </section>
  );
}
