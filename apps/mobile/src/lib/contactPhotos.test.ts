import { expect, it } from "vite-plus/test";

import {
  clearContactPhotos,
  createContactPhotoStore,
  type ContactPhotoFiles,
} from "./contactPhotos";

const openFiles = () => {
  const disk = new Map<string, string>();

  const files: ContactPhotoFiles = {
    readIndex: () => disk.get("photos/index.json") ?? null,
    writeIndex: (json) => void disk.set("photos/index.json", json),
    uri: (photoId) => `file:///photos/${photoId}.jpg`,
    adopt: (tempUri, photoId) => {
      if (!disk.delete(tempUri)) throw new Error("missing temporary file");
      disk.set(`photos/${photoId}.jpg`, "jpeg");
    },
    remove: (photoId) => void disk.delete(`photos/${photoId}.jpg`),
    discard: (tempUri) => void disk.delete(tempUri),
    sweepTemporary: () => {
      for (const key of disk.keys()) if (key.startsWith("cache/")) disk.delete(key);
    },
    wipe: () => {
      for (const key of disk.keys()) if (key.startsWith("photos/")) disk.delete(key);
    },
  };

  const pick = (name: string) => {
    disk.set(`cache/${name}.jpg`, "jpeg");

    return `cache/${name}.jpg`;
  };

  const photos = () =>
    [...disk.keys()].filter((key) => key.endsWith(".jpg") && key.startsWith("photos/"));

  return { disk, files, pick, photos };
};

const counter = () => {
  let n = 0;

  return () => `photo-${++n}`;
};

it("links a photo to a player and finds it again", () => {
  const { files, pick } = openFiles();
  const store = createContactPhotoStore(files, counter());

  expect(store.uriOf("ada")).toBeNull();
  store.set("ada", pick("a"));
  expect(store.uriOf("ada")).toBe("file:///photos/photo-1.jpg");
  expect(store.uriOf("grace")).toBeNull();
});

it("changing a photo writes the new file, drops the old one, and moves the URI", () => {
  const { files, pick, photos } = openFiles();
  const store = createContactPhotoStore(files, counter());

  store.set("ada", pick("a"));
  const first = store.uriOf("ada");
  store.set("ada", pick("b"));

  expect(store.uriOf("ada")).toBe("file:///photos/photo-2.jpg");
  expect(store.uriOf("ada")).not.toBe(first);
  expect(photos()).toEqual(["photos/photo-2.jpg"]);
});

it("removing a photo deletes both the key and the file", () => {
  const { disk, files, pick, photos } = openFiles();
  const store = createContactPhotoStore(files, counter());

  store.set("ada", pick("a"));
  store.set("grace", pick("b"));
  store.remove("ada");

  expect(store.uriOf("ada")).toBeNull();
  expect(JSON.parse(disk.get("photos/index.json")!)).toEqual({ grace: "photo-2" });
  expect(photos()).toEqual(["photos/photo-2.jpg"]);

  store.remove("ada");
  expect(photos()).toEqual(["photos/photo-2.jpg"]);
});

it("a failed link leaves the player's current photo alone", () => {
  const { files, pick, photos } = openFiles();
  const store = createContactPhotoStore(files, counter());

  store.set("ada", pick("a"));
  expect(() => store.set("ada", "cache/gone.jpg")).toThrow();
  expect(store.uriOf("ada")).toBe("file:///photos/photo-1.jpg");
  expect(photos()).toEqual(["photos/photo-1.jpg"]);
});

it("reads the index when it opens, so a photo is there before the first chip draws", () => {
  const { files, pick } = openFiles();
  createContactPhotoStore(files, counter()).set("ada", pick("a"));

  expect(createContactPhotoStore(files, counter()).uriOf("ada")).toBe("file:///photos/photo-1.jpg");
});

it("starts empty when the index is damaged", () => {
  const { disk, files } = openFiles();

  for (const raw of ["{", "[]", "null", '{"ada":4}']) {
    disk.set("photos/index.json", raw);
    expect(createContactPhotoStore(files).uriOf("ada")).toBeNull();
  }
});

it("sweeps leftover temporary files when it opens, and discard deletes one", () => {
  const { disk, files, pick } = openFiles();
  pick("left-behind");
  pick("another");
  disk.set("photos/photo-9.jpg", "jpeg");

  const store = createContactPhotoStore(files, counter());
  expect([...disk.keys()].filter((key) => key.startsWith("cache/"))).toEqual([]);
  expect(disk.has("photos/photo-9.jpg")).toBe(true);

  const kept = pick("kept");
  store.discard(kept);
  expect(disk.has(kept)).toBe(false);
});

it("signing out keeps photos, and only clearing them wipes the folder", () => {
  const { disk, files, pick, photos } = openFiles();
  createContactPhotoStore(files, counter()).set("ada", pick("a"));

  const afterSignOut = createContactPhotoStore(files, counter());
  expect(afterSignOut.uriOf("ada")).toBe("file:///photos/photo-1.jpg");
  const leftover = pick("unfinished");

  let notified = 0;
  afterSignOut.subscribe(() => notified++);
  afterSignOut.clear();

  expect(afterSignOut.uriOf("ada")).toBeNull();
  expect(photos()).toEqual([]);
  expect(disk.has(leftover)).toBe(false);
  expect(createContactPhotoStore(files, counter()).uriOf("ada")).toBeNull();
  expect(notified).toBe(1);
});

it("tells subscribers about a link, a change and a removal", () => {
  const { files, pick } = openFiles();
  const store = createContactPhotoStore(files, counter());
  let notified = 0;
  const unsubscribe = store.subscribe(() => notified++);

  store.set("ada", pick("a"));
  store.set("ada", pick("b"));
  store.remove("ada");
  expect(notified).toBe(3);

  unsubscribe();
  store.set("ada", pick("c"));
  expect(notified).toBe(3);
});

it("remembers that this phone won't share photos", () => {
  const { files } = openFiles();
  const store = createContactPhotoStore(files);

  expect(store.isUnavailable()).toBe(false);
  store.markUnavailable();
  expect(store.isUnavailable()).toBe(true);
});

it("exports one call that clears every photo, for deleting the account", () => {
  expect(() => clearContactPhotos()).not.toThrow();
});
