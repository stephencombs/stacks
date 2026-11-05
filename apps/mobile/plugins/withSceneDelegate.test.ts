import { expect, it } from "vite-plus/test";
import type { InfoPlist } from "expo/config-plugins";

import withSceneDelegate, { useRegisteredSceneDelegate } from "./withSceneDelegate";

const shipped = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: "Default Configuration",
        UISceneDelegateClassName: "ColorUp.SceneDelegate",
        UISceneStoryboardFile: "SplashScreen",
      },
    ],
    UIWindowSceneSessionRoleExternalDisplay: [
      { UISceneConfigurationName: "External", UISceneDelegateClassName: "ExternalDelegate" },
    ],
  },
};

it("loads the scene delegate under the name Expo registers", () => {
  const plist = useRegisteredSceneDelegate({
    UIApplicationSceneManifest: shipped,
  } as InfoPlist);

  expect(plist.UIApplicationSceneManifest).toEqual({
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: "Default Configuration",
          UISceneDelegateClassName: "SceneDelegate",
          UISceneStoryboardFile: "SplashScreen",
        },
      ],
      UIWindowSceneSessionRoleExternalDisplay: [
        { UISceneConfigurationName: "External", UISceneDelegateClassName: "ExternalDelegate" },
      ],
    },
  });
});

it("rewrites the unsubstituted module-qualified template name", () => {
  const plist = useRegisteredSceneDelegate({
    UIApplicationSceneManifest: {
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate" },
        ],
      },
    },
  } as InfoPlist);
  const manifest = plist.UIApplicationSceneManifest as typeof shipped;

  expect(
    manifest.UISceneConfigurations?.UIWindowSceneSessionRoleApplication?.[0]
      ?.UISceneDelegateClassName,
  ).toBe("SceneDelegate");
});

it("adds an application scene when the manifest is missing", () => {
  const plist = useRegisteredSceneDelegate({});

  expect(plist.UIApplicationSceneManifest).toEqual({
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: "Default Configuration",
          UISceneDelegateClassName: "SceneDelegate",
        },
      ],
    },
  });
});

it("installs an Info.plist mod on the mobile app config", async () => {
  const { default: appConfig } = await import("../app.config");
  const configured = withSceneDelegate({ name: "Color Up", slug: "stacks" });

  expect(appConfig().plugins).toContain("./plugins/withSceneDelegate");
  expect(configured.mods?.ios?.infoPlist).toEqual(expect.any(Function));
});
