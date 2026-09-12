'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import FeedbackModal from '../../../components/FeedbackModal';
import PageMascot from '../../../components/PageMascot';
import PageShell from '../components/PageShell';
import { getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import {
  INBOX_CHANGED,
  fetchInbox,
  formatInboxDate,
  inboxAction,
  inboxSnippet,
  inboxTitle,
  notifyInboxChanged,
  type InboxItem,
} from '../../../lib/inbox';
import MessageView from './MessageView';

const PAGE_SIZE = 20;
const SNACKBAR_MS = 7000;

const KIND_CHIP: Record<string, string> = {
  celebration: 'bg-[#e9f6ee] text-emerald-700',
  offer: 'bg-[#fdf6e3] text-[#8a6d1d]',
};

function jwtEmail(): string {
  const token = getToken();
  if (!token) return '';
  try {
    return JSON.parse(atob(token.split('.')[1])).email ?? '';
  } catch {
    return '';
  }
}

export default function InboxPage() {
  // useSearchParams needs a Suspense boundary under static export — same pattern
  // as ArticlesList.tsx.
  return (
    <Suspense fallback={<PageShell testId="inbox-page">{null}</PageShell>}>
      <InboxInner />
    </Suspense>
  );
}

interface Snackbar {
  text: string;
  undoIds?: number[];
}

function InboxInner() {
  const { tr, lang } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const openId = Number(searchParams.get('m')) || null;

  const [items, setItems] = useState<InboxItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [snackbar, setSnackbar] = useState<Snackbar | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  // Where a deleted row sat, so Undo can put it back in place rather than at the top.
  const removed = useRef<{ index: number; item: InboxItem } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    fetchInbox(PAGE_SIZE, 0)
      .then((page) => { setItems(page.items); setHasMore(page.has_more); setUnread(page.unread); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // A broadcast or an achievement that arrived while this page is open.
  useEffect(() => {
    const onChanged = (e: Event) => {
      if ((e as CustomEvent).detail) return;   // our own actions already updated the list
      load();
    };
    window.addEventListener(INBOX_CHANGED, onChanged);
    return () => window.removeEventListener(INBOX_CHANGED, onChanged);
  }, [load]);

  useEffect(() => {
    if (!snackbar) return;
    const timer = setTimeout(() => setSnackbar(null), SNACKBAR_MS);
    return () => clearTimeout(timer);
  }, [snackbar]);

  function showOlder() {
    fetchInbox(PAGE_SIZE, items.length)
      .then((page) => {
        setItems((current) => [...current, ...page.items]);
        setHasMore(page.has_more);
      })
      .catch(() => setSnackbar({ text: tr.inbox.actionError }));
  }

  function markAllRead() {
    const before = items;
    setItems((list) => list.map((i) => ({ ...i, read: true })));
    setUnread(0);
    inboxAction('read', { all: true })
      .then((res) => notifyInboxChanged({ unread: res.unread }))
      .catch(() => { setItems(before); setUnread(before.filter((i) => !i.read).length); setSnackbar({ text: tr.inbox.actionError }); });
  }

  const handleRead = useCallback((id: number, nextUnread: number) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, read: true } : i)));
    setUnread(nextUnread);
  }, []);

  const handleDeleted = useCallback((id: number, affectedIds: number[], nextUnread: number) => {
    setItems((list) => {
      const index = list.findIndex((i) => i.id === id);
      if (index >= 0) removed.current = { index, item: list[index] };
      return list.filter((i) => i.id !== id);
    });
    setUnread(nextUnread);
    setSnackbar({ text: tr.inbox.deleted, undoIds: affectedIds });
    router.replace('/dashboard/inbox', { scroll: false });
  }, [router, tr.inbox.deleted]);

  function undo(ids: number[]) {
    setSnackbar(null);
    inboxAction('undelete', { ids })
      .then((res) => {
        notifyInboxChanged({ unread: res.unread });
        setUnread(res.unread);
        const restore = removed.current;
        if (restore) {
          setItems((list) => {
            const next = [...list];
            next.splice(Math.min(restore.index, next.length), 0, restore.item);
            return next;
          });
          removed.current = null;
        } else {
          load();
        }
      })
      .catch(() => setSnackbar({ text: tr.inbox.actionError }));
  }

  const snackbarNode = snackbar && (
    <div
      data-testid="inbox-snackbar"
      className="fixed left-4 bottom-6 z-50 flex items-center gap-3 rounded-[10px] bg-ink px-4 py-3 text-[13.5px] text-white"
    >
      <span>{snackbar.text}</span>
      {snackbar.undoIds && snackbar.undoIds.length > 0 && (
        <button
          type="button"
          onClick={() => undo(snackbar.undoIds!)}
          data-testid="inbox-undo"
          className="inline-flex items-center min-h-11 font-semibold text-white underline underline-offset-2"
        >
          {tr.inbox.undo}
        </button>
      )}
    </div>
  );

  const modal = (
    <FeedbackModal
      open={replyTo !== null}
      onClose={() => setReplyTo(null)}
      initialMessage={replyTo ? `${tr.inbox.replyPrefix.replace('{title}', replyTo)}\n\n` : undefined}
      initialEmail={jwtEmail()}
    />
  );

  if (openId) {
    return (
      <PageShell testId="inbox-page">
        <MessageView
          deliveryId={openId}
          onBack={() => router.back()}
          onRead={handleRead}
          onDeleted={handleDeleted}
          onActionError={() => setSnackbar({ text: tr.inbox.actionError })}
          onReply={setReplyTo}
        />
        {snackbarNode}
        {modal}
      </PageShell>
    );
  }

  return (
    <PageShell testId="inbox-page">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-[32px] font-bold">
          {tr.inbox.title}
          {unread > 0 && <span className="ml-2 text-[20px] font-semibold text-muted">{unread}</span>}
        </h1>
        {unread > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            data-testid="inbox-mark-all"
            className="min-h-11 px-2 text-[13.5px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            {tr.inbox.markAllRead}
          </button>
        )}
      </div>

      {loading && (
        <div className="border border-line rounded-[14px] bg-white overflow-hidden" data-testid="inbox-skeleton">
          {[0, 1, 2].map((i) => (
            <div key={i} className="px-4 py-4 border-b border-line-soft last:border-b-0">
              <div className="h-3.5 w-1/2 rounded bg-[#f2f3f3] animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!loading && failed && (
        <div className="border border-line rounded-[14px] bg-white px-5 py-4 flex items-center justify-between gap-3">
          <span className="text-[13.5px] text-muted">{tr.inbox.loadError}</span>
          <button
            type="button"
            onClick={load}
            data-testid="inbox-retry"
            className="inline-flex items-center min-h-11 rounded-[10px] border border-[#ddd] bg-white px-5 py-2.5 text-sm font-semibold text-ink"
          >
            {tr.inbox.retry}
          </button>
        </div>
      )}

      {!loading && !failed && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12" data-testid="inbox-empty">
          <PageMascot phrase="Tuščia!" />
          <p className="text-[15px] text-muted">{tr.inbox.empty}</p>
        </div>
      )}

      {!loading && !failed && items.length > 0 && (
        <div className="border border-line rounded-[14px] bg-white overflow-hidden" data-testid="inbox-list">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/dashboard/inbox?m=${item.id}`}
              scroll={false}
              data-testid="inbox-row"
              title={formatInboxDate(item.created_at, lang)}
              className={`flex items-start gap-3 px-4 py-3 min-h-11 border-b border-line-soft last:border-b-0 text-ink hover:text-ink transition-colors ${
                item.read ? 'bg-[#f2f3f3]' : 'bg-white font-semibold'
              }`}
            >
              <span className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${item.read ? 'bg-transparent' : 'bg-emerald-600'}`} />
              <span className="min-w-0 flex-1 flex flex-col min-[860px]:flex-row min-[860px]:items-baseline min-[860px]:gap-3">
                <span className="flex items-baseline justify-between gap-2 min-[860px]:w-[110px] min-[860px]:shrink-0">
                  <span className="text-[13.5px]">{tr.inbox.sender}</span>
                  <span className="text-[12px] text-faint min-[860px]:hidden">{formatInboxDate(item.created_at, lang)}</span>
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px]">
                  {KIND_CHIP[item.kind] && (
                    <span className={`mr-2 rounded-full px-2 py-[2px] text-[11px] font-semibold ${KIND_CHIP[item.kind]}`}>
                      {item.kind === 'celebration' ? tr.inbox.kinds.celebration : tr.inbox.kinds.offer}
                    </span>
                  )}
                  {inboxTitle(item, lang)}
                  <span className="font-normal text-muted"> — {inboxSnippet(item, lang)}</span>
                </span>
                <span className="hidden min-[860px]:block text-[12px] font-normal text-faint shrink-0">
                  {formatInboxDate(item.created_at, lang)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {!loading && !failed && hasMore && (
        <button
          type="button"
          onClick={showOlder}
          data-testid="inbox-show-older"
          className="mt-4 inline-flex items-center min-h-11 rounded-[10px] border border-[#ddd] bg-white px-5 py-2.5 text-sm font-semibold text-ink hover:border-ink transition-colors"
        >
          {tr.inbox.showOlder}
        </button>
      )}

      {snackbarNode}
      {modal}
    </PageShell>
  );
}
