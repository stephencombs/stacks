import { newId } from "@stacks/client-runtime/ids";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { useSyncExternalStore } from "react";

/** The files behind the photo store. Photos are device-local and can't be fetched again. */
export interface ContactPhotoFiles {
  readonly readIndex: () => string | null;
  readonly writeIndex: (json: string) => void;
  readonly uri: (photoId: string) => string;
  /** Moves a picked temporary file into the photo folder as `photoId`. */
  readonly adopt: (tempUri: string, photoId: string) => void;
  readonly remove: (photoId: string) => void;
  readonly discard: (tempUri: string) => void;
  /** Deletes every temporary file a pick left behind. */
  readonly sweepTemporary: () => void;
  /** Deletes the photo folder: every photo and the index. */
  readonly wipe: () => void;
}

const decodeIndex = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)),
);

const noPhotos: Readonly<Record<string, string>> = {};

const parseIndex = (raw: string | null) =>
  raw ? Option.getOrElse(decodeIndex(raw), () => noPhotos) : noPhotos;

/**
 * One photo per player ID, kept on this phone only. The index is read once, when the store opens,
 * so a chip never waits on a file to show a face.
 */
export const createContactPhotoStore = (files: ContactPhotoFiles, photoId = newId) => {
  const listeners = new Set<() => void>();

  files.sweepTemporary();

  let index = parseIndex(files.readIndex());
  let unavailable = false;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const writeIndex = (next: Readonly<Record<string, string>>) => {
    index = next;
    files.writeIndex(JSON.stringify(index));
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    uriOf: (playerId: string) => {
      const id = index[playerId];

      return id === undefined ? null : files.uri(id);
    },
    set: (playerId: string, tempUri: string) => {
      const next = photoId();
      const previous = index[playerId];
      files.adopt(tempUri, next);
      writeIndex({ ...index, [playerId]: next });

      if (previous !== undefined) files.remove(previous);
      emit();
    },
    remove: (playerId: string) => {
      const previous = index[playerId];

      if (previous === undefined) return;
      writeIndex(Object.fromEntries(Object.entries(index).filter(([key]) => key !== playerId)));
      files.remove(previous);
      emit();
    },
    discard: (tempUri: string) => files.discard(tempUri),
    clear: () => {
      files.wipe();
      files.sweepTemporary();
      index = {};
      emit();
    },
    isUnavailable: () => unavailable,
    markUnavailable: () => {
      if (unavailable) return;
      unavailable = true;
      emit();
    },
  };
};

const inertFiles: ContactPhotoFiles = {
  readIndex: () => null,
  writeIndex: () => {},
  uri: (photoId) => photoId,
  adopt: () => {},
  remove: () => {},
  discard: () => {},
  sweepTemporary: () => {},
  wipe: () => {},
};

const loadFiles = () => {
  if (typeof process !== "undefined" && process.env?.VITEST) return inertFiles;

  // SAFETY: this specifier is the module beside this one; tests return before requiring it.
  const { contactPhotoFiles } =
    require("./contactPhotoFiles") as typeof import("./contactPhotoFiles");

  return contactPhotoFiles;
};

const store = createContactPhotoStore(loadFiles());

/** The photo linked to a player on this phone, as an image URI, or `null` for initials. */
export const useContactPhoto = (playerId: string) =>
  useSyncExternalStore(store.subscribe, () => store.uriOf(playerId));

/** False once a pick shows this phone's Contacts app won't share photos. */
export const useContactPhotosAvailable = () =>
  !useSyncExternalStore(store.subscribe, store.isUnavailable);

export const linkContactPhoto = store.set;
export const removeContactPhoto = store.remove;
export const discardContactPick = store.discard;
export const markContactPhotosUnavailable = store.markUnavailable;

/** Deletes every photo on this phone. Signing out keeps them; deleting the account calls this. */
export const clearContactPhotos = store.clear;
