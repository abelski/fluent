'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL } from '../../lib/api';
import { useT } from '../../lib/useT';
import TakChevron from '../../components/TakChevron';

export default function ExtensionPage() {
  const { tr } = useT();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/extension/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.version) setVersion(data.version);
      })
      .catch(() => {
        // Silently ignore — the version line just stays on the loading label.
      });
  }, []);

  const downloadUrl = `${BACKEND_URL}/api/extension/download`;

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-12 flex flex-col gap-8">

        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-3xl">
            🧩
          </div>
          <div>
            <h1 className="font-headline text-3xl font-bold text-gray-900">{tr.extension.title}</h1>
            <p className="text-gray-500 mt-2 leading-relaxed">{tr.extension.subtitle}</p>
          </div>
        </div>

        <div className="border border-gray-900 rounded-2xl bg-white p-6 flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-gray-400" data-testid="extension-version">
            {version ? tr.extension.versionLabel.replace('{version}', version) : tr.extension.versionLoading}
          </p>
          <a
            href={downloadUrl}
            data-testid="extension-download-link"
            className="px-6 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors text-sm"
          >
            {tr.extension.downloadBtn}
          </a>
          <p className="text-xs text-gray-400">{tr.extension.premiumNote}</p>
        </div>

        <div className="border border-gray-900 rounded-2xl bg-white overflow-hidden">
          <h2 className="px-6 py-4 border-b border-gray-900 font-headline font-bold text-lg bg-gray-50">
            {tr.extension.installTitle}
          </h2>
          <ol className="divide-y divide-gray-100">
            {tr.extension.installSteps.map((step, i) => (
              <li key={i} className="px-6 py-4 flex gap-3 items-start">
                <span className="shrink-0 w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-sm text-gray-700">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="border border-gray-900 rounded-2xl bg-white overflow-hidden">
          <h2 className="px-6 py-4 border-b border-gray-900 font-headline font-bold text-lg bg-gray-50">
            {tr.extension.usageTitle}
          </h2>
          <ol className="divide-y divide-gray-100">
            {tr.extension.usageSteps.map((step, i) => (
              <li key={i} className="px-6 py-4 flex gap-3 items-start">
                <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-sm text-gray-700">{step}</span>
              </li>
            ))}
          </ol>
          <p className="px-6 py-4 border-t border-gray-100 text-sm text-gray-500">{tr.extension.connectNote}</p>
        </div>

        <div className="border border-gray-900 rounded-2xl bg-white p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-gray-600">{tr.extension.fromInternetNote}</p>
          <Link
            href="/dashboard/lists"
            className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors shrink-0"
          >
            {tr.extension.viewListsLink} <TakChevron size={10} className="inline-block align-[-1px]" />
          </Link>
        </div>

      </div>
    </main>
  );
}
