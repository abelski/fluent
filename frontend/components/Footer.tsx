'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL } from '../lib/api';

interface FooterArticle {
  slug: string;
  title_ru: string;
  title_en: string;
}

export default function Footer() {
  const [links, setLinks] = useState<FooterArticle[]>([]);

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

        {links.length > 0 && (
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
          </nav>
        )}
      </div>
    </footer>
  );
}
