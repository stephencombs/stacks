import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { withDangerousMod, type ConfigPlugin } from "expo/config-plugins";

/**
 * Android's native tab bar draws its icons from drawable resources, so the Material Symbols in
 * `assets/tab-icons` become `res/drawable/tab_*.xml`, named by `placeTab` on Android.
 */
const withAndroidTabIcons: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    "android",
    (config) => {
      const source = join(config.modRequest.projectRoot, "assets", "tab-icons");
      const drawable = join(config.modRequest.platformProjectRoot, "app/src/main/res/drawable");
      mkdirSync(drawable, { recursive: true });

      for (const file of readdirSync(source))
        copyFileSync(join(source, file), join(drawable, file));

      return config;
    },
  ]);

export default withAndroidTabIcons;
