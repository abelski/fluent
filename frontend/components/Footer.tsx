'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL } from '../lib/api';
import { useT } from '../lib/useT';
import FeedbackModal from './FeedbackModal';

interface FooterArticle {
  slug: string;
  title_ru: string;
  title_en: string;
}

export default function Footer() {
  const { tr, lang } = useT();
  const [links, setLinks] = useState<FooterArticle[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/footer-articles`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setLinks(data))
      .catch(() => {});
  }, []);

  return (
    <footer className="relative z-10 border-t border-line">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-8 py-7 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-[13px] text-muted-nav">
        <p className="text-[13px] text-muted-nav">© 2026 Fluent Team. All rights reserved.</p>

        <nav className="flex items-center gap-6 flex-wrap justify-center sm:justify-end">
          {links.map((a) => (
            <Link
              key={a.slug}
              href={`/dashboard/articles/${a.slug}`}
              className="text-[13px] text-muted-nav hover:text-gray-700 transition-colors whitespace-nowrap"
            >
              {lang === 'en' ? a.title_en : a.title_ru}
            </Link>
          ))}
          <button
            onClick={() => setFeedbackOpen(true)}
            data-testid="footer-feedback-btn"
            className="text-[13px] text-muted-nav hover:text-gray-700 transition-colors whitespace-nowrap"
          >
            {tr.feedback.title}
          </button>
        </nav>
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </footer>
  );
}
