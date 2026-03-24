const COOKIE_KEY = 'fluent_star_level';

export function getStarLevel(): number {
  if (typeof document === 'undefined') return 1;
  const match = document.cookie.match(/fluent_star_level=(\d)/);
  return match ? parseInt(match[1], 10) : 1;
}

export function setStarLevel(level: number): void {
  document.cookie = `${COOKIE_KEY}=${level}; path=/; max-age=${60 * 60 * 24 * 365}`;
}
