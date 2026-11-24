import { Directory, File, Paths } from "expo-file-system";

import { excludeFromBackup } from "../../modules/contact-picker/src";
import type { ContactPhotoFiles } from "./contactPhotos";

const folder = () => new Directory(Paths.document, "contact-photos");
const photo = (photoId: string) => new File(folder(), `${photoId}.jpg`);

// WARNING: the native picker writes into this same folder name under the cache.
const picks = () => new Directory(Paths.cache, "contact-picks");

const ensureFolder = () => {
  const directory = folder();

  directory.create({ intermediates: true, idempotent: true });
  excludeFromBackup(directory.uri);

  return directory;
};

/** @public Loaded by `contactPhotos` with `require`, which knip can't follow. */
export const contactPhotoFiles: ContactPhotoFiles = {
  readIndex: () => {
    const file = new File(folder(), "index.json");

    return file.exists ? file.textSync() : null;
  },
  writeIndex: (json) => {
    ensureFolder();
    new File(folder(), "index.json").writeSync(json);
  },
  uri: (photoId) => photo(photoId).uri,
  adopt: (tempUri, photoId) => {
    ensureFolder();
    new File(tempUri).moveSync(photo(photoId));
  },
  remove: (photoId) => {
    const file = photo(photoId);

    if (file.exists) file.delete();
  },
  discard: (tempUri) => {
    const file = new File(tempUri);

    if (file.exists) file.delete();
  },
  sweepTemporary: () => {
    const directory = picks();

    if (directory.exists) directory.delete();
  },
  wipe: () => {
    const directory = folder();

    if (directory.exists) directory.delete();
  },
};
