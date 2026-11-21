import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  type ConfigPlugin,
} from "expo/config-plugins";

export const LIVE_UPDATE_PERMISSIONS = [
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.POST_PROMOTED_NOTIFICATIONS",
] as const;

export function addLiveUpdatePermissions(
  manifest: AndroidConfig.Manifest.AndroidManifest,
): AndroidConfig.Manifest.AndroidManifest {
  const existing = manifest.manifest["uses-permission"] ?? [];
  const names = new Set(existing.map((item) => item.$?.["android:name"]));
  const next = [...existing];
  for (const permission of LIVE_UPDATE_PERMISSIONS) {
    if (!names.has(permission)) {
      next.push({ $: { "android:name": permission } });
    }
  }
  manifest.manifest["uses-permission"] = next;
  return manifest;
}

/**
 * Configures Android notifications for Live Updates (spec 023): declares `POST_NOTIFICATIONS`
 * and `POST_PROMOTED_NOTIFICATIONS`, and copies the monochrome status-bar icon resource.
 */
const withAndroidLiveUpdates: ConfigPlugin = (config) => {
  config = withAndroidManifest(config, (config) => {
    config.modResults = addLiveUpdatePermissions(config.modResults);
    return config;
  });
  return withDangerousMod(config, [
    "android",
    (config) => {
      const source = join(config.modRequest.projectRoot, "assets", "notification-icon.xml");
      const drawable = join(config.modRequest.platformProjectRoot, "app/src/main/res/drawable");
      mkdirSync(drawable, { recursive: true });
      copyFileSync(source, join(drawable, "ic_stat_color_up.xml"));
      return config;
    },
  ]);
};

export default withAndroidLiveUpdates;
