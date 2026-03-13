import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-gray-900 bg-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between gap-4">
        <Link href="/dashboard/lists" className="font-bold text-[1.75rem] tracking-tight text-gray-600 hover:text-gray-900 transition-colors leading-none">
          fluent<span className="text-emerald-600">.</span>
        </Link>
        <p className="text-gray-400 text-sm">be fluent.</p>
      </div>
    </footer>
  );
}
