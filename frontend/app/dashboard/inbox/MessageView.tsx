'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useT } from '../../../lib/useT';
import {
  fetchMessage,
  formatFullDate,
  inboxAction,
  inboxTitle,
  notifyInboxChanged,
  type InboxDetail,
} from '../../../lib/inbox';

interface Props {
  deliveryId: number;
  onBack: () => void;
  onRead: (id: number, unread: number) => void;
  onDeleted: (id: number, affectedIds: number[], unread: number) => void;
  onActionError: () => void;
  onReply: (title: string) => void;
}

const KIND_CHIP: Record<string, string> = {
  celebration: 'bg-[#e9f6ee] text-emerald-700',
  offer: 'bg-[#fdf6e3] text-[#8a6d1d]',
};

/** One opened message. Gmail's reading pane: it replaces the list rather than splitting it. */
export default function MessageView({ deliveryId, onBack, onRead, onDeleted, onActionError, onReply }: Props) {
  const { tr, lang } = useT();
  const [item, setItem] = useState<InboxDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const markedRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItem(null);
    setFailed(false);
    fetchMessage(deliveryId)
      .then((data) => { if (!cancelled) setItem(data.item); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [deliveryId]);

  // Opening an unread message marks it read, once per message.
  useEffect(() => {
    if (!item || item.read || markedRef.current === item.id) return;
    markedRef.current = item.id;
    inboxAction('read', { ids: [item.id] })
      .then((res) => {
        notifyInboxChanged({ unread: res.unread });
        onRead(item.id, res.unread);
      })
      .catch(() => {});
  }, [item, onRead]);

  function remove() {
    if (!item) return;
    inboxAction('delete', { ids: [item.id] })
      .then((res) => {
        notifyInboxChanged({ unread: res.unread });
        onDeleted(item.id, res.affected_ids, res.unread);
      })
      .catch(onActionError);
  }

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      data-testid="inbox-back"
      className="inline-flex items-center min-h-11 text-[13.5px] text-muted hover:text-ink transition-colors"
    >
      ← {tr.inbox.back}
    </button>
  );

  if (failed) {
    return (
      <div data-testid="inbox-message" className="flex flex-col gap-3">
        {backButton}
        <div className="border border-line rounded-[14px] bg-white px-5 py-4 flex items-center justify-between gap-3">
          <span className="text-[13.5px] text-muted">{tr.inbox.loadError}</span>
          <button
            type="button"
            onClick={() => { setFailed(false); setItem(null); fetchMessage(deliveryId).then((d) => setItem(d.item)).catch(() => setFailed(true)); }}
            data-testid="inbox-retry"
            className="inline-flex items-center min-h-11 rounded-[10px] border border-[#ddd] bg-white px-5 py-2.5 text-sm font-semibold text-ink"
          >
            {tr.inbox.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div data-testid="inbox-message" className="flex flex-col gap-3">
        {backButton}
        <div className="border border-line rounded-[14px] bg-white px-5 py-6">
          <div className="h-4 w-2/3 rounded bg-[#f2f3f3] animate-pulse mb-3" />
          <div className="h-3 w-full rounded bg-[#f2f3f3] animate-pulse" />
        </div>
      </div>
    );
  }

  const ctaLabel = lang === 'en' ? item.cta_label_en : item.cta_label_ru;

  return (
    <div data-testid="inbox-message" className="flex flex-col gap-3">
      {backButton}

      <article className="border border-line rounded-[14px] bg-white px-5 py-5">
        <header className="flex items-start gap-2 flex-wrap mb-4">
          <h1 className="text-xl font-semibold text-ink">{inboxTitle(item, lang)}</h1>
          {KIND_CHIP[item.kind] && (
            <span className={`rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold ${KIND_CHIP[item.kind]}`}>
              {item.kind === 'celebration' ? tr.inbox.kinds.celebration : tr.inbox.kinds.offer}
            </span>
          )}
        </header>

        <div className="flex items-center gap-3 mb-5">
          <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[13px] font-semibold shrink-0">
            F
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold text-ink">
              {tr.inbox.sender}
              <span className="font-normal text-muted"> · {tr.inbox.sources[item.source] ?? item.source}</span>
            </span>
            <span className="block text-[12.5px] text-faint">{formatFullDate(item.created_at, lang)}</span>
          </span>
        </div>

        <p className="text-[14.5px] leading-[1.75] text-ink whitespace-pre-line">
          {lang === 'en' ? item.body_en : item.body_ru}
        </p>

        {item.cta_url && ctaLabel && (
          <Link
            href={item.cta_url}
            data-testid="inbox-cta"
            className="inline-flex items-center min-h-11 mt-5 rounded-[10px] bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:text-white transition-colors"
          >
            {ctaLabel}
          </Link>
        )}
      </article>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onReply(inboxTitle(item, lang))}
          data-testid="inbox-reply"
          className="inline-flex items-center min-h-11 rounded-[10px] border border-[#ddd] bg-white px-5 py-2.5 text-sm font-semibold text-ink hover:border-ink transition-colors"
        >
          {tr.inbox.reply}
        </button>
        <button
          type="button"
          onClick={remove}
          data-testid="inbox-delete"
          className="min-h-11 px-2 text-sm font-semibold text-destructive hover:opacity-80 transition-opacity"
        >
          {tr.inbox.delete}
        </button>
      </div>
    </div>
  );
}
