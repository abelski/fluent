import { useEffect, useRef } from 'react';

/**
 * Pick one of a short on-screen list with the number keys (1 → first option).
 *
 * Every quiz surface that shows a list of buttons uses this hook, so the shortcut
 * means the same thing everywhere. Pass `null` for `onPick` to switch it off (wrong
 * stage, answer already shown, …) — the listener stays mounted and does nothing.
 *
 * Caps at 9 options, because there is no 10 key.
 */
export function useNumberKeys(count: number, onPick: ((index: number) => void) | null) {
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pick.current || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
      // Never steal a digit the user is typing (answer inputs, the feedback modal).
      const el = document.activeElement as HTMLElement | null;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.isContentEditable) return;
      const i = e.key.charCodeAt(0) - 49; // '1' → 0
      if (i < 0 || i >= Math.min(count, 9)) return;
      e.preventDefault();
      pick.current(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);
}
