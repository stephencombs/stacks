let lastMs = 0;
let sequence = 0;

/**
 * A UUIDv7: time-ordered, so rows created offline still sort by creation, and random enough
 * that clients can mint IDs without asking the server. IDs minted in the same millisecond, or
 * after the clock steps back, keep minting order through a 12-bit counter (RFC 9562 method 1).
 */
export const newId = (now = Date.now()): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  if (now > lastMs) {
    lastMs = now;
    sequence = ((bytes[6]! & 0x07) << 8) | bytes[7]!;
  } else if (++sequence > 0xfff) {
    lastMs += 1;
    sequence = 0;
  }
  const timestamp = BigInt(lastMs);
  for (let i = 0; i < 6; i++) bytes[i] = Number((timestamp >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = 0x70 | (sequence >> 8);
  bytes[7] = sequence & 0xff;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
