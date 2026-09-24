import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Static guard for plan #48a — fails the moment a hardcoded Russian string or
 * a `'ru-RU'` locale literal appears outside the allowed places. Runs on raw
 * source text: no browser page, no server.
 *
 * Allowed Cyrillic:
 *   - comments (// line and /* block *\/)
 *   - `metadata` / `generateMetadata` blocks (RU SEO, deliberately unchanged)
 *   - `frontend/lib/i18n/ru.ts` (the RU dictionary itself)
 *   - lines carrying an explicit `// i18n-allow` marker
 */

const ROOTS = ['app', 'components', 'lib'];
const CYRILLIC = /[А-Яа-яЁё]/;
const RU_RU_LOCALE = /'ru-RU'/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(tsx?|ts)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Strips // line comments and block comments so they don't trip the guard. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

/**
 * Blanks out `metadata`/`generateMetadata` object or function blocks (RU SEO,
 * deliberately kept in Russian). Uses brace-depth matching from the
 * declaration keyword to the matching closing brace.
 */
function stripMetadataBlocks(src: string): string {
  const constRe = /export\s+const\s+metadata\s*[:=]/g;
  const fnRe = /export\s+(async\s+)?function\s+generateMetadata\s*\(/g;
  let result = '';
  let lastIndex = 0;
  const matches: { start: number; braceHint: number }[] = [];

  let m: RegExpExecArray | null;
  while ((m = constRe.exec(src))) {
    matches.push({ start: m.index, braceHint: constRe.lastIndex });
  }
  while ((m = fnRe.exec(src))) {
    // fnRe stops right after the opening '(' of the param list — walk to its
    // matching ')' first, so the destructured-param braces aren't mistaken
    // for the function body's opening brace.
    let depth = 1;
    let i = fnRe.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
    }
    matches.push({ start: m.index, braceHint: i });
  }
  matches.sort((a, b) => a.start - b.start);

  for (const { start, braceHint } of matches) {
    if (start < lastIndex) continue; // already covered by a previous block
    const braceStart = src.indexOf('{', braceHint);
    if (braceStart === -1) continue;
    let depth = 0;
    let i = braceStart;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    result += src.slice(lastIndex, start);
    result += src.slice(start, i).replace(/[^\n]/g, ' ');
    lastIndex = i;
  }
  result += src.slice(lastIndex);
  return result;
}

interface Leak {
  file: string;
  line: number;
  text: string;
}

function findLeaks(root: string): Leak[] {
  const leaks: Leak[] = [];
  const files = walk(path.join(root, 'app'))
    .concat(walk(path.join(root, 'components')))
    .concat(walk(path.join(root, 'lib')));

  for (const file of files) {
    const rel = path.relative(root, file);
    if (rel === path.join('lib', 'i18n', 'ru.ts')) continue;

    const original = fs.readFileSync(file, 'utf8');
    let cleaned = stripComments(original);
    cleaned = stripMetadataBlocks(cleaned);

    const originalLines = original.split('\n');
    const cleanedLines = cleaned.split('\n');

    for (let i = 0; i < cleanedLines.length; i++) {
      const originalLine = originalLines[i] ?? '';
      if (originalLine.includes('i18n-allow')) continue;
      const line = cleanedLines[i];
      if (CYRILLIC.test(line) || RU_RU_LOCALE.test(line)) {
        leaks.push({ file: rel, line: i + 1, text: originalLine.trim() });
      }
    }
  }
  return leaks;
}

test('no hardcoded Russian in app/components/lib (outside i18n/metadata/comments)', () => {
  const root = path.resolve(__dirname, '..');
  const leaks = findLeaks(root);
  if (leaks.length > 0) {
    const report = leaks.map((l) => `${l.file}:${l.line}  ${l.text}`).join('\n');
    expect(leaks, `Hardcoded Russian / 'ru-RU' literals found:\n${report}`).toEqual([]);
  }
});
