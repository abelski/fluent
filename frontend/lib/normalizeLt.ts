export function collapseWs(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function normalizeLt(text: string): string {
  return collapseWs(
    text
      .normalize('NFD')
      .replace(/[̀́̃]/g, '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/į/g, 'i').replace(/č/g, 'c').replace(/š/g, 's')
      .replace(/ž/g, 'z').replace(/ū/g, 'u').replace(/ų/g, 'u')
      .replace(/ę/g, 'e').replace(/ė/g, 'e').replace(/ą/g, 'a')
  );
}

export function isAnswerMatch(typed: string, answer: string): boolean {
  const normTyped = normalizeLt(typed);
  // The book separates alternate forms two ways: with a slash for the long/short
  // conditional ("atsakýtume / atsakýtumėme", issue #138) and with a comma where a
  // verb has two paradigms — bū́ti prints "esù, būnù" and "yrà, bū̃na". Either
  // alternate is a correct answer, so accept both separators.
  return answer
    .split(/[/,]/)
    .map((alt) => alt.trim())
    .filter(Boolean)
    .some((alt) => normalizeLt(alt) === normTyped);
}
