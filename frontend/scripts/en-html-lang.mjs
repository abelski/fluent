// Post-build (#48c): the root layout hardcodes <html lang="ru">; the /en/ twins are
// English, so rewrite the attribute in out/en/**/*.html. LangSync keeps it right at runtime.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out', 'en');
// Manual walk: readdirSync's `recursive` needs Node >= 18.17, and Render's Node isn't pinned.
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
let n = 0;
for (const p of fs.existsSync(EN) ? walk(EN) : []) {
  if (!p.endsWith('.html')) continue;
  const html = fs.readFileSync(p, 'utf8');
  const out = html.replace('<html lang="ru"', '<html lang="en"');
  if (out !== html) { fs.writeFileSync(p, out); n++; }
}
console.log(`en-html-lang: set lang="en" in ${n} file(s) under out/en/`);
