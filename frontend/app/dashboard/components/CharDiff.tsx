'use client';

type CharOp = { char: string; ok: boolean };

function diffChars(typed: string, target: string): CharOp[] {
  const a = typed.toLowerCase();
  const b = target.toLowerCase();
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);

  const ops: CharOp[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ char: typed[i - 1], ok: true });
      i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.unshift({ char: typed[i - 1], ok: false }); // substitution
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.unshift({ char: typed[i - 1], ok: false }); // extra char
      i--;
    } else {
      ops.unshift({ char: '_', ok: false }); // missing char
      j--;
    }
  }
  return ops;
}

export default function CharDiff({ typed, target, labelTyped, labelCorrect }: {
  typed: string;
  target: string;
  labelTyped: string;
  labelCorrect: string;
}) {
  const ops = diffChars(typed, target);
  return (
    <div data-testid="char-diff" className="text-sm font-mono space-y-1 text-center">
      <div>
        <span className="text-gray-400 text-xs mr-1">{labelTyped}</span>
        {ops.map((op, i) => (
          <span key={i} className={op.ok ? 'text-gray-700' : 'text-red-500 font-semibold'}>{op.char}</span>
        ))}
      </div>
      <div>
        <span className="text-gray-400 text-xs mr-1">{labelCorrect}</span>
        <span className="font-bold text-gray-900">{target}</span>
      </div>
    </div>
  );
}
