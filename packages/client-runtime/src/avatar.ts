/** How many tonal colors a letter tile can take; the mobile palette defines `avatar-1` to this many. */
export const AVATAR_TONES = 6;

const startsWord = /[\p{L}\p{N}]/u;
const mark = /\p{M}/u;

const lead = (word: string) => {
  const points = Array.from(word);
  const at = points.findIndex((point) => startsWord.test(point));

  if (at === -1) return "";
  let end = at + 1;

  while (end < points.length && mark.test(points[end]!)) end++;

  return points.slice(at, end).join("").toLocaleUpperCase();
};

/**
 * The letters a contact avatar shows, the way Contacts does: the first letter of the first and
 * last word, or only the first when `count` is 1. Emoji, punctuation and symbols never count, so
 * a name with no letter or number at all gives `""` and the avatar draws a silhouette instead.
 */
export const initialsOf = (name: string, count: 1 | 2 = 2) => {
  const words = name
    .split(/\s+/)
    .map(lead)
    .filter((initial) => initial !== "");

  const first = words[0];

  if (first === undefined) return "";

  return count === 1 || words.length === 1 ? first : `${first}${words[words.length - 1]!}`;
};

/** A letter tile's tone from 1 to `AVATAR_TONES`, from a player's ID alone, so it never changes. */
export const avatarToneOf = (playerId: string) => {
  let hash = 0x811c9dc5;

  for (let i = 0; i < playerId.length; i++) {
    hash ^= playerId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return (hash % AVATAR_TONES) + 1;
};
