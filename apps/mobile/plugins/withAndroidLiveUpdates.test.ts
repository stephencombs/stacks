import type { AndroidConfig } from "expo/config-plugins";
import { expect, it } from "vite-plus/test";

import { LIVE_UPDATE_PERMISSIONS, addLiveUpdatePermissions } from "./withAndroidLiveUpdates";

it("adds POST_NOTIFICATIONS and POST_PROMOTED_NOTIFICATIONS idempotently", () => {
  const manifest: AndroidConfig.Manifest.AndroidManifest = {
    manifest: {
      $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
      "uses-permission": [{ $: { "android:name": "android.permission.INTERNET" } }],
      queries: [],
    },
  };

  addLiveUpdatePermissions(manifest);
  addLiveUpdatePermissions(manifest);

  const names = manifest.manifest["uses-permission"]?.map((p) => p.$?.["android:name"]);
  expect(names).toEqual(["android.permission.INTERNET", ...LIVE_UPDATE_PERMISSIONS]);
});
