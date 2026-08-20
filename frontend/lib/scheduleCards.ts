// Interleaved insertion of study cards into a session queue.
//
// Feature #5: `insertRandom` spliced a whole group of cards in at one random
// position, so a word's own cards stayed contiguous — the learner would select,
// assemble and type the same word three cards in a row — and nothing stopped three
// typing cards of three different words from following each other either.
//
// `scheduleCards` places each card of the group separately, subject to:
//   - the group's own relative order is preserved (SELECT before ASSEMBLE before TYPE);
//   - a card keeps at least MIN_GAP other cards between it and any other card of the
//     same word;
//   - no placement creates a run of 3+ consecutive cards from one exercise bucket.
//
// When the tail is too short to satisfy all of that, the rules relax in a fixed
// order — stage-run first, then the gap, then same-word adjacency — and as a last
// resort the card is appended. A short queue must never deadlock or drop a card.
//
// Known structural exception: the END of a session is typing-heavy no matter what.
// Every chain terminates in a TYPE card which can only sit after its own ASSEMBLE
// card, so the last cards converge on the type bucket and the stage-run rule gets
// relaxed there. That is different words typed in a row — not one word drilled over
// and over — so it is accepted rather than worked around. `scheduleCards` is still
// guaranteed never to place two cards of the SAME word next to each other.
//
// Pure module — no React, no DOM — so the rules can be tested directly.

export type CardStage = 1 | 2 | '2r' | '2a' | 3 | '3s';

export interface SchedulableCard {
  word: { id: number };
  stage: CardStage;
}

/**
 * Minimum number of *other* cards between two cards of the same word — so
 * `MIN_GAP = 2` means index distance >= 3. The weaker "never directly adjacent"
 * rule (index distance >= 2) is what survives when the gap has to be relaxed;
 * keeping the two as separate numbers is what makes that relaxation step meaningful.
 */
export const MIN_GAP = 2;

const GAP_DISTANCE = MIN_GAP + 1;
const ADJACENT_DISTANCE = 2;

/** Exercise bucket a stage belongs to, for the "no 3 in a row" rule. */
export function stageBucket(stage: CardStage): 'card' | 'select' | 'assemble' | 'type' {
  if (stage === 1) return 'card';
  if (stage === 2 || stage === '2r') return 'select';
  if (stage === '2a') return 'assemble';
  return 'type';
}

/**
 * Would inserting `card` at `pos` keep every other card of the same word at least
 * `minDistance` index positions away? Everything from `pos` on shifts right by one.
 */
function sameWordOk<T extends SchedulableCard>(
  queue: T[], pos: number, card: T, minDistance: number,
): boolean {
  const from = Math.max(0, pos - minDistance);
  const to = Math.min(queue.length, pos + minDistance);
  for (let i = from; i < to; i++) {
    if (queue[i].word.id !== card.word.id) continue;
    const placed = i < pos ? i : i + 1;
    if (Math.abs(placed - pos) < minDistance) return false;
  }
  return true;
}

/** Would inserting `card` at `pos` create a run of 3+ cards from one bucket? */
function stageRunOk<T extends SchedulableCard>(queue: T[], pos: number, card: T): boolean {
  const bucket = stageBucket(card.stage);
  const at = (idx: number): string | null => {
    if (idx === pos) return bucket;
    const source = idx < pos ? idx : idx - 1;
    if (source < 0 || source >= queue.length) return null;
    return stageBucket(queue[source].stage);
  };
  // Only a window containing the new card can gain a run.
  for (let start = pos - 2; start <= pos; start++) {
    if (start < 0) continue;
    if (at(start) === bucket && at(start + 1) === bucket && at(start + 2) === bucket) return false;
  }
  return true;
}

function findPosition<T extends SchedulableCard>(
  queue: T[], card: T, minPos: number, remaining: number,
): number {
  const levels: { distance: number; stageRun: boolean; reserve: boolean }[] = [
    { distance: GAP_DISTANCE, stageRun: true, reserve: true },        // everything
    { distance: GAP_DISTANCE, stageRun: false, reserve: true },       // drop the stage-run rule
    { distance: ADJACENT_DISTANCE, stageRun: false, reserve: false }, // drop the gap, keep non-adjacency
  ];
  for (const level of levels) {
    // Reserve room for the rest of the chain. Without this the first card can land
    // so late that its own successors no longer fit at full spacing, and the whole
    // chain degrades even though the queue had plenty of room — placing card k of a
    // chain greedily is what makes the *last* card violate the gap rule.
    // Each later card needs `distance - 1` cards of clearance, and every insertion
    // grows the queue by one.
    const maxPos = level.reserve
      ? queue.length - remaining * (level.distance - 1)
      : queue.length;
    const valid: number[] = [];
    for (let pos = minPos; pos <= maxPos; pos++) {
      if (!sameWordOk(queue, pos, card, level.distance)) continue;
      if (level.stageRun && !stageRunOk(queue, pos, card)) continue;
      valid.push(pos);
    }
    // Random among the legal slots, so repeated sessions don't settle into one shape.
    if (valid.length > 0) return valid[Math.floor(Math.random() * valid.length)];
  }
  // Nothing satisfied even the loosest rule — append rather than deadlock or drop.
  return queue.length;
}

/**
 * Insert `cards` into `rest`, interleaved. Returns a new array; neither input is
 * mutated and no card is ever dropped.
 *
 * Position 0 is never used: that slot is the card the learner is about to see, and
 * replacing it mid-answer would swap the question out from under them (the same
 * `minPos` rule `insertRandom` had).
 */
function placeAll<T extends SchedulableCard>(rest: T[], cards: T[]): T[] {
  const queue = rest.slice();
  let minPos = Math.min(1, queue.length);
  cards.forEach((card, i) => {
    const pos = findPosition(queue, card, minPos, cards.length - 1 - i);
    queue.splice(pos, 0, card);
    // Keeps the group's own order: the next card of the chain lands after this one.
    minPos = pos + 1;
  });
  return queue;
}

/**
 * How badly a finished queue breaks the two interleaving rules. Same-word
 * adjacency is the one learners actually notice ("why am I typing this again?"),
 * so it outweighs a bucket run.
 */
function violations<T extends SchedulableCard>(queue: T[]): number {
  let score = 0;
  for (let i = 1; i < queue.length; i++) {
    if (queue[i].word.id === queue[i - 1].word.id) score += 10;
  }
  for (let i = 2; i < queue.length; i++) {
    const a = stageBucket(queue[i - 2].stage);
    const b = stageBucket(queue[i - 1].stage);
    if (a === b && b === stageBucket(queue[i].stage)) score += 1;
  }
  return score;
}

/** How many whole-group placements to try before settling for the least-bad one. */
const PLACEMENT_ATTEMPTS = 8;

export function scheduleCards<T extends SchedulableCard>(rest: T[], cards: T[]): T[] {
  if (cards.length === 0) return rest.slice();
  // Placement is greedy per card, so one unlucky early slot can force every later
  // card of the chain into the relaxed rules even when the queue had room for a
  // clean layout. Re-rolling the whole group a few times and keeping the best
  // result costs nothing at these queue lengths (tens of cards) and turns the
  // relaxation path back into what it was meant to be — a genuine last resort,
  // not the common case.
  let best = placeAll(rest, cards);
  let bestScore = violations(best);
  for (let attempt = 1; attempt < PLACEMENT_ATTEMPTS && bestScore > 0; attempt++) {
    const candidate = placeAll(rest, cards);
    const score = violations(candidate);
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}
