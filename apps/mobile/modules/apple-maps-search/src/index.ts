export type AppleMapsPlace = {
  readonly name: string;
  readonly city: string | null;
  readonly region: string | null;
  readonly country: string | null;
  readonly lat: number;
  readonly lng: number;
};

type NativeAppleMapsSearch = {
  searchCasinos: (
    query: string,
    lat: number | null,
    lng: number | null,
  ) => Promise<ReadonlyArray<AppleMapsPlace>>;
};

const loadNative = () => {
  if (typeof process !== "undefined" && process.env?.VITEST) return null;

  try {
    // SAFETY: this specifier is the installed expo package, which exposes requireOptionalNativeModule.
    const expo = require("expo") as typeof import("expo");

    return expo.requireOptionalNativeModule<NativeAppleMapsSearch>("AppleMapsSearch");
  } catch {
    return null;
  }
};

export const appleMapsSearch: NativeAppleMapsSearch | null = loadNative();
