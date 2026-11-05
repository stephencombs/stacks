import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  withAppDelegate,
  withDangerousMod,
  IOSConfig,
  type ConfigPlugin,
} from "expo/config-plugins";

export function instrumentAppDelegate(source: string, implementation: string) {
  if (source.includes("StartupCrashRecovery.install()")) return source;
  const anchor = "    let delegate = ReactNativeDelegate()";
  if (!source.includes(anchor)) throw new Error("Unrecognized Expo AppDelegate template");
  return `${source.replace(anchor, `    StartupCrashRecovery.install()\n${anchor}`)}\n${implementation}`;
}

export function instrumentSceneDelegate(source: string) {
  if (source.includes("StartupCrashRecovery.show(in: scene, retry:")) return source;
  const anchor = "class SceneDelegate: ExpoAppSceneDelegate {";
  if (!source.includes(anchor)) throw new Error("Unrecognized Expo SceneDelegate template");
  return (
    "import UIKit\n" +
    source.replace(
      anchor,
      `${anchor}
  override func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    if let recoveryWindow = StartupCrashRecovery.show(in: scene, retry: {
      self.startReact(scene, session: session, connectionOptions: connectionOptions)
    }) {
      window = recoveryWindow
      return
    }
    startReact(scene, session: session, connectionOptions: connectionOptions)
  }

  private func startReact(
    _ scene: UIScene,
    session: UISceneSession,
    connectionOptions: UIScene.ConnectionOptions
  ) {
    super.scene(scene, willConnectTo: session, options: connectionOptions)
  }
`,
    )
  );
}

const withStartupCrashRecovery: ConfigPlugin = (config) => {
  config = withAppDelegate(config, (config) => {
    config.modResults.contents = instrumentAppDelegate(
      config.modResults.contents,
      readFileSync(join(__dirname, "StartupCrashRecovery.swift"), "utf8"),
    );
    return config;
  });
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const appDelegate = IOSConfig.Paths.getAppDelegateFilePath(config.modRequest.projectRoot);
      const path = join(dirname(appDelegate), "SceneDelegate.swift");
      writeFileSync(path, instrumentSceneDelegate(readFileSync(path, "utf8")));
      return config;
    },
  ]);
};

export default withStartupCrashRecovery;
