/**
 * EZRAB Game Space — command detection (src/game-space/command.ts)
 *
 * Pure, dependency-free matcher for the game commands. The input is expected
 * to be normalized already (lowercase, trimmed, collapsed whitespace) — the
 * same normalization the chat intent router applies — but the function is
 * defensive and normalizes again so it can be unit-tested standalone.
 *
 * Supported commands (case/space-insensitive):
 *   game | /game | main game | buka game | game space
 *
 * Deliberately NOT matched: sentences that merely mention the word "game"
 * without a play/open verb (e.g. "apa itu game?"), so normal chat keeps
 * flowing to the AI.
 */

const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');

/** Slash form handled here too, so the router can share one code path. */
const SLASH_FORMS = new Set(['/game', '/games', '/maingame', '/game-space', '/gamespace']);

/** Bare / natural-language forms. Ordered most-specific first. */
const PATTERNS: RegExp[] = [
  /^game[!\s.?]*$/, // "game", "game!", "game "
  /^games[!\s.?]*$/,
  /\bgame\s+space\b/, // "game space", "buka game space"
  /\b(main|mainkan|maen)\b[\s\w]*\bgame\b/, // "main game", "ayo main game"
  /\b(buka|bukain|bukakan|tampilkan|tampilin|lihat|masuk)\b.*\bgame\b/, // "buka game"
  /\bgame\b.*\b(dibuka|dimulai|mulai)\b/, // "game dimulai"
];

export function isGameCommand(rawInput: string): boolean {
  const input = norm(rawInput);
  if (!input) return false;
  const firstToken = input.split(' ')[0];
  if (firstToken.startsWith('/')) {
    return SLASH_FORMS.has(firstToken);
  }
  return PATTERNS.some((re) => re.test(input));
}
