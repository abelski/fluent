// RU SEO snapshot / diff guard (#48c).
//
//   node scripts/seo-snapshot.mjs [--out file.json]   → write (or print) a snapshot
//   node scripts/seo-snapshot.mjs --diff baseline.json → exit 1 on any RU SEO change
//
// Reads every out/**/index.html except out/en/** and extracts title, description,
// canonical and hreflang links. The only change --diff allows is hreflang links
// ADDED to a page under /dashboard/articles/ (never the `_` placeholder).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (p === path.join(OUT, 'en') || e.name === '_next') continue;
      walk(p, acc);
    } else if (e.name === 'index.html') acc.push(p);
  }
  return acc;
}

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1] ?? null;

function extract(html) {
  const head = html.split(/<\/head>/i)[0];
  const tags = head.match(/<(meta|link)\b[^>]*>/gi) ?? [];
  const desc = tags.find((t) => /^<meta/i.test(t) && attr(t, 'name') === 'description');
  const canon = tags.find((t) => /^<link/i.test(t) && attr(t, 'rel') === 'canonical');
  const hreflang = tags
    .filter((t) => /^<link/i.test(t) && attr(t, 'rel') === 'alternate' && attr(t, 'hreflang'))
    .map((t) => `${attr(t, 'hreflang')} ${attr(t, 'href')}`)
    .sort();
  return {
    title: head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? null,
    description: desc ? attr(desc, 'content') : null,
    canonical: canon ? attr(canon, 'href') : null,
    hreflang,
  };
}

export function snapshot() {
  const snap = {};
  for (const f of walk(OUT).sort()) {
    const route = '/' + path.relative(OUT, path.dirname(f)).split(path.sep).join('/');
    snap[route === '/' ? '/' : route + '/'] = extract(fs.readFileSync(f, 'utf8'));
  }
  return snap;
}

export function diff(base, cur) {
  const errors = [];
  for (const route of new Set([...Object.keys(base), ...Object.keys(cur)])) {
    const b = base[route];
    const c = cur[route];
    if (!b) { errors.push(`${route}: new page`); continue; }
    if (!c) { errors.push(`${route}: page missing`); continue; }
    for (const k of ['title', 'description', 'canonical']) {
      if (b[k] !== c[k]) errors.push(`${route}: ${k} changed\n  - ${b[k]}\n  + ${c[k]}`);
    }
    const removed = b.hreflang.filter((h) => !c.hreflang.includes(h));
    const added = c.hreflang.filter((h) => !b.hreflang.includes(h));
    if (removed.length) errors.push(`${route}: hreflang removed ${removed.join(', ')}`);
    if (added.length) {
      const ok = route.startsWith('/dashboard/articles/') && route !== '/dashboard/articles/_/';
      if (!ok) errors.push(`${route}: hreflang added outside /dashboard/articles/ ${added.join(', ')}`);
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const cur = snapshot();
  const di = args.indexOf('--diff');
  const oi = args.indexOf('--out');
  if (di >= 0) {
    const base = JSON.parse(fs.readFileSync(args[di + 1], 'utf8'));
    const errors = diff(base, cur);
    if (errors.length) {
      console.error(`RU SEO changed on ${errors.length} point(s):\n` + errors.join('\n'));
      process.exit(1);
    }
    console.log(`RU SEO unchanged across ${Object.keys(cur).length} pages (hreflang additions allowed on articles).`);
  } else if (oi >= 0) {
    fs.writeFileSync(args[oi + 1], JSON.stringify(cur, null, 2) + '\n');
    console.log(`Wrote ${Object.keys(cur).length} pages to ${args[oi + 1]}`);
  } else {
    console.log(JSON.stringify(cur, null, 2));
  }
}
