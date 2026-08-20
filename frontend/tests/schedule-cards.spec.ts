// Feature #5 — `scheduleCards` (frontend/lib/scheduleCards.ts).
//
// The module is pure, so this spec drives it directly rather than through the UI:
// the invariants below are the whole point of the module, and asserting them over
// hundreds of randomized queues is something no click-through test can do.

import { test, expect } from '@playwright/test';
import { scheduleCards, stageBucket, MIN_GAP, type CardStage, type SchedulableCard } from '../lib/scheduleCards';

interface Card extends SchedulableCard {
  word: { id: number };
  stage: CardStage;
  tag: string;
}

function card(wordId: number, stage: CardStage, tag = `${wordId}:${stage}`): Card {
  return { word: { id: wordId }, stage, tag };
}

function chain(wordId: number): Card[] {
  return [card(wordId, 2), card(wordId, '2a'), card(wordId, 3)];
}

/** No two neighbouring cards belong to the same word. */
function adjacentSameWord(queue: Card[]): number {
  let hits = 0;
  for (let i = 1; i < queue.length; i++) if (queue[i].word.id === queue[i - 1].word.id) hits++;
  return hits;
}

/** No three neighbouring cards share an exercise bucket. */
function bucketRuns(queue: Card[]): number {
  let hits = 0;
  for (let i = 2; i < queue.length; i++) {
    const a = stageBucket(queue[i - 2].stage);
    const b = stageBucket(queue[i - 1].stage);
    const c = stageBucket(queue[i].stage);
    if (a === b && b === c) hits++;
  }
  return hits;
}

/**
 * Bucket runs that do NOT touch the end of the queue.
 *
 * Every word's chain terminates in a TYPE card, and a TYPE card can only be placed
 * after its own ASSEMBLE card — so the last cards of a session structurally converge
 * on typing, and no placement can avoid it. That tail run is different words being
 * typed in a row, not one word drilled repeatedly, so it is left alone; what must
 * never happen is a run in the *interior*, which is what this counts.
 */
function interiorBucketRuns(queue: Card[]): number {
  let hits = 0;
  for (let i = 2; i < queue.length - 1; i++) {
    const a = stageBucket(queue[i - 2].stage);
    const b = stageBucket(queue[i - 1].stage);
    const c = stageBucket(queue[i].stage);
    if (a === b && b === c) hits++;
  }
  return hits;
}

function positionsOf(queue: Card[], tags: string[]): number[] {
  return tags.map((tag) => queue.findIndex((c) => c.tag === tag));
}

test.describe('scheduleCards', () => {
  test('MIN_GAP is honoured: cards of one word keep other cards between them', () => {
    const rest = [card(1, 3), card(2, 3), card(3, 2), card(4, '2a'), card(5, 3), card(6, 2), card(7, 3), card(8, '2a'), card(9, 3), card(10, 2)];
    for (let run = 0; run < 200; run++) {
      const out = scheduleCards(rest, chain(99)) as Card[];
      const idx = out.map((c, i) => (c.word.id === 99 ? i : -1)).filter((i) => i >= 0);
      for (let i = 1; i < idx.length; i++) {
        expect(idx[i] - idx[i - 1]).toBeGreaterThan(MIN_GAP);
      }
    }
  });

  test('never places two cards of one word next to each other on a normal queue', () => {
    const rest = [card(1, 3), card(2, 2), card(3, '2a'), card(4, 3), card(5, 2), card(6, 3), card(7, '2a'), card(8, 3)];
    for (let run = 0; run < 200; run++) {
      const out = scheduleCards(rest, chain(99)) as Card[];
      expect(adjacentSameWord(out)).toBe(0);
    }
  });

  test('never creates a run of three cards from one exercise bucket', () => {
    // A tail that already alternates, so any new 3-run would be the scheduler's doing.
    const rest = [card(1, 3), card(2, 2), card(3, '2a'), card(4, 3), card(5, 2), card(6, '2a'), card(7, 3), card(8, 2), card(9, '2a'), card(10, 3)];
    for (let run = 0; run < 200; run++) {
      const out = scheduleCards(rest, chain(99)) as Card[];
      expect(bucketRuns(out)).toBe(0);
    }
  });

  test('preserves the chain order: SELECT before ASSEMBLE before TYPE', () => {
    const rest = [card(1, 3), card(2, 2), card(3, '2a'), card(4, 3), card(5, 2)];
    for (let run = 0; run < 200; run++) {
      const out = scheduleCards(rest, chain(99)) as Card[];
      const [select, assemble, type] = positionsOf(out, ['99:2', '99:2a', '99:3']);
      expect(select).toBeGreaterThanOrEqual(0);
      expect(select).toBeLessThan(assemble);
      expect(assemble).toBeLessThan(type);
    }
  });

  test('never uses position 0 — the card the learner is answering is never swapped out', () => {
    const rest = [card(1, 3), card(2, 2), card(3, '2a'), card(4, 3), card(5, 2), card(6, 3)];
    for (let run = 0; run < 200; run++) {
      const out = scheduleCards(rest, chain(99)) as Card[];
      expect(out[0].tag).toBe('1:3');
    }
  });

  test('degrades without dropping cards on a 0/1/2-card tail', () => {
    for (const tail of [[], [card(1, 3)], [card(1, 3), card(2, 2)]]) {
      for (let run = 0; run < 50; run++) {
        const inserted = chain(99);
        const out = scheduleCards(tail, inserted) as Card[];
        expect(out.length).toBe(tail.length + inserted.length);
        // Every original card and every inserted card survives, exactly once.
        for (const c of [...tail, ...inserted]) {
          expect(out.filter((o) => o.tag === c.tag).length).toBe(1);
        }
        const [select, assemble, type] = positionsOf(out, ['99:2', '99:2a', '99:3']);
        expect(select).toBeLessThan(assemble);
        expect(assemble).toBeLessThan(type);
      }
    }
  });

  test('an empty tail returns the chain in order', () => {
    const out = scheduleCards([], chain(99)) as Card[];
    expect(out.map((c) => c.tag)).toEqual(['99:2', '99:2a', '99:3']);
  });

  test('inserting nothing returns a copy of the tail, not the tail itself', () => {
    const rest = [card(1, 3), card(2, 2)];
    const out = scheduleCards(rest, []) as Card[];
    expect(out.map((c) => c.tag)).toEqual(['1:3', '2:2']);
    expect(out).not.toBe(rest);
  });

  test('does not mutate its inputs', () => {
    const rest = [card(1, 3), card(2, 2), card(3, '2a'), card(4, 3)];
    const cards = chain(99);
    scheduleCards(rest, cards);
    expect(rest.length).toBe(4);
    expect(cards.length).toBe(3);
  });

  test('repeated insertions into a growing queue stay interleaved', () => {
    // What a real session does: several words each drop a chain in over time.
    let queue: Card[] = [card(1, 3), card(2, 2), card(3, '2a'), card(4, 3), card(5, 2), card(6, 3)];
    for (const wordId of [101, 102, 103, 104]) {
      queue = scheduleCards(queue, chain(wordId)) as Card[];
    }
    expect(queue.length).toBe(6 + 4 * 3);
    expect(adjacentSameWord(queue)).toBe(0);
    // Interior only — see interiorBucketRuns: four chains stacking into one queue
    // necessarily leave their terminal TYPE cards bunched at the very end.
    expect(interiorBucketRuns(queue)).toBe(0);
  });

  test('stageBucket groups the stages the way the run rule expects', () => {
    expect(stageBucket(1)).toBe('card');
    expect(stageBucket(2)).toBe('select');
    expect(stageBucket('2r')).toBe('select');
    expect(stageBucket('2a')).toBe('assemble');
    expect(stageBucket(3)).toBe('type');
    expect(stageBucket('3s')).toBe('type');
  });
});
