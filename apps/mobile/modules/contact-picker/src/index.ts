type NativeContactPicker = {
  pickContact: () => Promise<string | null>;
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

/** The picked contact's full name, or `null` when the user cancels or the contact has none. */
export const pickContact = () =>
  native
    ? native.pickContact()
    : Promise.reject(new Error("The Contacts picker isn't in this build of the app."));
