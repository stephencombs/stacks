import { AndroidConfig } from "expo/config-plugins";
import { expect, it } from "vite-plus/test";
import {
  backupRulesXml,
  dataExtractionRulesXml,
  setBackupRules,
} from "./withAndroidContactPhotoBackup";

const manifest: AndroidConfig.Manifest.AndroidManifest = {
  manifest: {
    $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
    application: [{ $: { "android:name": ".MainApplication", "android:allowBackup": "true" } }],
    queries: [],
  },
};

it("keeps friends' photos out of cloud backup and device transfer", () => {
  const cloud = dataExtractionRulesXml.split("<device-transfer>")[0]!;
  const transfer = dataExtractionRulesXml.split("<device-transfer>")[1]!;

  for (const rules of [cloud, transfer, backupRulesXml])
    expect(rules).toContain('<exclude domain="file" path="contact-photos"/>');

  expect(cloud).toContain("<cloud-backup>");
});

it("keeps what the secure store's own rules did", () => {
  for (const rules of [backupRulesXml, dataExtractionRulesXml]) {
    expect(rules).toContain('<include domain="sharedpref" path="."/>');
    expect(rules).toContain('<exclude domain="sharedpref" path="SecureStore"/>');
  }
});

it("points the application at both rule files and keeps its other attributes", () => {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(setBackupRules(manifest));

  expect(application.$).toMatchObject({
    "android:name": ".MainApplication",
    "android:allowBackup": "true",
    "android:fullBackupContent": "@xml/color_up_backup_rules",
    "android:dataExtractionRules": "@xml/color_up_data_extraction_rules",
  });
});
