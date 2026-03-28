'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL } from '../lib/api';
import FeedbackModal from './FeedbackModal';

interface FooterArticle {
  slug: string;
  title_ru: string;
  title_en: string;
}

export default function Footer() {
  const [links, setLinks] = useState<FooterArticle[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/footer-articles`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setLinks(data))
      .catch(() => {});
  }, []);

  return (
    <footer className="relative z-10 border-t border-gray-100 bg-white">
      <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-gray-400 text-sm">© 2026 Fluent Team. All rights reserved.</p>

        <nav className="flex items-center gap-4 flex-wrap justify-center sm:justify-end">
          {links.map((a) => (
            <Link
              key={a.slug}
              href={`/dashboard/articles/${a.slug}`}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              {a.title_ru}
            </Link>
          ))}
          <button
            onClick={() => setFeedbackOpen(true)}
            data-testid="footer-feedback-btn"
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            Написать нам
          </button>
        </nav>
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </footer>
  );
}
