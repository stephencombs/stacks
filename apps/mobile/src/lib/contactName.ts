const MAX_LENGTH = 60;
const LONE_HIGH_SURROGATE = /[\uD800-\uDBFF]$/;

/** A picked contact's name as it goes into the Name field, or `null` when there's nothing to fill. */
export const contactName = (raw: string) => {
  const name = raw.trim().slice(0, MAX_LENGTH).replace(LONE_HIGH_SURROGATE, "").trim();

  return name === "" ? null : name;
};
