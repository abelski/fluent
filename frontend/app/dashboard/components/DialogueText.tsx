'use client';

// Practice passage / dialogue renderer — moved unchanged from `practice/[id]/page.tsx`
// (#62a) so the knowledge-check `reading` task in GrammarTaskRunner can reuse it.

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- Dialogue rendering helpers ---

function speakerColor(name: string): string {
  const palette = [
    'bg-indigo-100 text-indigo-700',
    'bg-emerald-100 text-emerald-700',
    'bg-rose-100 text-rose-700',
    'bg-amber-100 text-amber-700',
    'bg-violet-100 text-violet-700',
  ];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % palette.length;
  return palette[h];
}

const ANON_COLORS = [
  'bg-blue-50 border-blue-200 text-blue-900',
  'bg-slate-50 border-slate-200 text-slate-800',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const InlineOnly = ({ children }: any) => <>{children}</>;

export default function DialogueText({ text }: { text: string }) {
  const lines = text.split('\n');
  let turn = -1;
  const lineData = lines.map((line) => {
    const dashMatch = line.match(/^—\s?(.*)/);
    const nameMatch = line.match(/^\*\*([^*]+):\*\*\s*(.*)/);
    const isDialogue = !!(dashMatch || nameMatch);
    if (isDialogue) turn++;
    return { line, dashMatch, nameMatch, turn };
  });

  return (
    <div className="flex flex-col gap-1.5">
      {lineData.map(({ line, dashMatch, nameMatch, turn: t }, i) => {
        if (line.trim() === '') return <div key={i} className="h-2" />;

        if (dashMatch) {
          const badge = t % 2 === 0
            ? 'bg-blue-200 text-blue-800'
            : 'bg-slate-200 text-slate-700';
          return (
            <div key={i} className={`px-3 py-2 rounded-lg border text-sm flex gap-2 items-start ${ANON_COLORS[t % 2]}`}>
              <span className={`shrink-0 mt-0.5 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${badge}`}>
                {t % 2 === 0 ? 'A' : 'B'}
              </span>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: InlineOnly }}>
                {dashMatch[1]}
              </ReactMarkdown>
            </div>
          );
        }

        if (nameMatch) {
          const colorCls = speakerColor(nameMatch[1]);
          return (
            <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm text-gray-900">
              <span className={`shrink-0 mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${colorCls}`}>
                {nameMatch[1]}
              </span>
              <span className="leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: InlineOnly }}>
                  {nameMatch[2]}
                </ReactMarkdown>
              </span>
            </div>
          );
        }

        return (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={{
            p: ({ children }) => <p className="text-sm text-gray-600 leading-relaxed">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-gray-800">{children}</strong>,
          }}>
            {line}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}
