import { withPodfile, type ConfigPlugin } from "expo/config-plugins";

const enableGamma = "ENV['RNS_GAMMA_ENABLED'] = '1'\n";

export function enableIosFormSheet(podfile: string): string {
  return podfile.startsWith(enableGamma) ? podfile : enableGamma + podfile;
}

const withIosFormSheet: ConfigPlugin = (config) =>
  withPodfile(config, (mod) => {
    // RNScreens only compiles its experimental FormSheet when CocoaPods sees this flag.
    mod.modResults.contents = enableIosFormSheet(mod.modResults.contents);

    return mod;
  });

export default withIosFormSheet;
