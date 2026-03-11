import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-[#060d07]">
      <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between gap-4">
        <Link href="/dashboard/lists" className="font-bold text-[1.75rem] tracking-tight text-white/70 hover:text-white transition-colors leading-none">
          fluent<span className="text-emerald-400">.</span>
        </Link>
        <p className="text-white/40 text-sm">be fluent.</p>
      </div>
    </footer>
  );
}
