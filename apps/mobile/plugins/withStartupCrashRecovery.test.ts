import { expect, it } from "vite-plus/test";
import withStartupCrashRecovery, {
  instrumentAppDelegate,
  instrumentSceneDelegate,
} from "./withStartupCrashRecovery";

const app = `class AppDelegate: ExpoAppDelegate {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}`;
const scene = `internal import Expo
@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}`;

it("installs exception capture before React Native initializes and preserves the delegate", () => {
  const result = instrumentAppDelegate(app, "// native recovery implementation");
  expect(result.indexOf("StartupCrashRecovery.install()")).toBeLessThan(
    result.indexOf("let delegate = ReactNativeDelegate()"),
  );
  expect(result).toContain("return super.application");
  expect(instrumentAppDelegate(result, "// native recovery implementation")).toBe(result);
});

it("shows recovery before starting React and preserves normal scene startup and retry", () => {
  const result = instrumentSceneDelegate(scene);
  expect(result).toContain("StartupCrashRecovery.show(in: scene, retry:");
  expect(result).toContain(
    "self.startReact(scene, session: session, connectionOptions: connectionOptions)",
  );
  expect(result).toContain(
    "super.scene(scene, willConnectTo: session, options: connectionOptions)",
  );
  expect(instrumentSceneDelegate(result)).toBe(result);
});

it("fails prebuild if an SDK template changes instead of shipping without capture", () => {
  expect(() => instrumentAppDelegate("unrecognized", "")).toThrow();
  expect(() => instrumentSceneDelegate("unrecognized")).toThrow();
});

it("registers native generation hooks on the mobile app", async () => {
  const { default: appConfig } = await import("../app.config");
  const configured = withStartupCrashRecovery({ name: "Color Up", slug: "stacks" });
  expect(appConfig().plugins).toContain("./plugins/withStartupCrashRecovery");
  expect(configured).toHaveProperty("mods.ios.appDelegate");
  expect(configured).toHaveProperty("mods.ios.dangerous");
});
