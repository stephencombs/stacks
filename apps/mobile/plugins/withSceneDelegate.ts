import { withInfoPlist, type ConfigPlugin, type InfoPlist } from "expo/config-plugins";

// SceneDelegate.swift is `@objc(SceneDelegate)`. The Expo template writes
// `$(PRODUCT_MODULE_NAME).SceneDelegate`, and iOS cannot load that name.
const SCENE_DELEGATE_CLASS = "SceneDelegate";
const APPLICATION_ROLE = "UIWindowSceneSessionRoleApplication";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function useRegisteredSceneDelegate(infoPlist: InfoPlist): InfoPlist {
  const manifest = isRecord(infoPlist.UIApplicationSceneManifest)
    ? { ...infoPlist.UIApplicationSceneManifest }
    : {};
  const configurations = isRecord(manifest.UISceneConfigurations)
    ? { ...manifest.UISceneConfigurations }
    : {};
  const existing = configurations[APPLICATION_ROLE];
  const rewritten = Array.isArray(existing)
    ? existing.flatMap((scene) =>
        isRecord(scene) ? [{ ...scene, UISceneDelegateClassName: SCENE_DELEGATE_CLASS }] : [],
      )
    : [];
  const scenes =
    rewritten.length > 0
      ? rewritten
      : [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: SCENE_DELEGATE_CLASS,
          },
        ];

  return {
    ...infoPlist,
    UIApplicationSceneManifest: {
      ...manifest,
      UIApplicationSupportsMultipleScenes:
        typeof manifest.UIApplicationSupportsMultipleScenes === "boolean"
          ? manifest.UIApplicationSupportsMultipleScenes
          : false,
      UISceneConfigurations: { ...configurations, [APPLICATION_ROLE]: scenes },
    },
  };
}

const withSceneDelegate: ConfigPlugin = (config) =>
  withInfoPlist(config, (config) => {
    config.modResults = useRegisteredSceneDelegate(config.modResults);
    return config;
  });

export default withSceneDelegate;
