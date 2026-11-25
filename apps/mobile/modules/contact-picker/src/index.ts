/** A picked contact's photo: a square JPEG in the cache, or why there isn't one. */
export type ContactPhoto = { readonly uri: string } | "none" | "unavailable";

/** The photo's file URI, or `null` when there isn't one to show. */
export const photoUri = (photo: ContactPhoto) =>
  photo === "none" || photo === "unavailable" ? null : photo.uri;

export type PickedContact = {
  readonly name: string;
  readonly photo: ContactPhoto;
};

type NativeContactPicker = {
  pickContact: () => Promise<PickedContact | null>;
  excludeFromBackup?: (uri: string) => boolean;
};

const loadNative = () => {
  if (typeof process !== "undefined" && process.env?.VITEST) return null;

  try {
    // SAFETY: this specifier is the installed expo package, which exposes requireOptionalNativeModule.
    const expo = require("expo") as typeof import("expo");

    return expo.requireOptionalNativeModule<NativeContactPicker>("ContactPicker");
  } catch {
    return null;
  }
};

const native = loadNative();

/**
 * The picked contact's full name and photo, or `null` when the user cancels or the contact has no
 * name. The photo is `"none"` for a contact without one and `"unavailable"` when the platform
 * wouldn't share it. Neither platform asks for a permission.
 */
export const pickContact = () =>
  native
    ? native.pickContact()
    : Promise.reject(new Error("The Contacts picker isn't in this build of the app."));

/** Keeps a folder out of iCloud and device backups. Android does this in its backup rules. */
export const excludeFromBackup = (uri: string) => native?.excludeFromBackup?.(uri) ?? false;
