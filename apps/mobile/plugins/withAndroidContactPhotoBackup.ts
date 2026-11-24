import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  type ConfigPlugin,
} from "expo/config-plugins";

export const BACKUP_RULES = "color_up_backup_rules";
export const EXTRACTION_RULES = "color_up_data_extraction_rules";

const kept = `<include domain="sharedpref" path="."/>
<exclude domain="sharedpref" path="SecureStore"/>
<exclude domain="file" path="contact-photos"/>`;

const indent = (lines: string, by: string) =>
  lines
    .split("\n")
    .map((line) => `${by}${line}`)
    .join("\n");

export const backupRulesXml = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
${indent(kept, "  ")}
</full-backup-content>
`;

export const dataExtractionRulesXml = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
${indent(kept, "    ")}
  </cloud-backup>
  <device-transfer>
${indent(kept, "    ")}
  </device-transfer>
</data-extraction-rules>
`;

export function setBackupRules(manifest: AndroidConfig.Manifest.AndroidManifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  application.$["android:fullBackupContent"] = `@xml/${BACKUP_RULES}`;
  application.$["android:dataExtractionRules"] = `@xml/${EXTRACTION_RULES}`;

  return manifest;
}

/**
 * Friends' photos live on one phone and can't be fetched again, so Android's cloud backup and
 * device transfer leave them out. These rules replace expo-secure-store's (turn off its
 * `configureAndroidBackup`) and keep what they did: back up shared preferences except the secure
 * store.
 */
const withAndroidContactPhotoBackup: ConfigPlugin = (config) => {
  config = withAndroidManifest(config, (config) => {
    config.modResults = setBackupRules(config.modResults);

    return config;
  });

  return withDangerousMod(config, [
    "android",
    (config) => {
      const xml = join(config.modRequest.platformProjectRoot, "app/src/main/res/xml");
      mkdirSync(xml, { recursive: true });
      writeFileSync(join(xml, `${BACKUP_RULES}.xml`), backupRulesXml);
      writeFileSync(join(xml, `${EXTRACTION_RULES}.xml`), dataExtractionRulesXml);

      return config;
    },
  ]);
};

export default withAndroidContactPhotoBackup;
