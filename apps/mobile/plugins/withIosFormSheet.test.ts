import { expect, it } from "vite-plus/test";

import { enableIosFormSheet } from "./withIosFormSheet";

it("enables the native FormSheet before CocoaPods loads the screens podspec", () => {
  const podfile = "require 'json'\ntarget 'ColorUp' do\n  use_expo_modules!\nend\n";
  const enabled = enableIosFormSheet(podfile);

  expect(enabled).toBe(`ENV['RNS_GAMMA_ENABLED'] = '1'\n${podfile}`);
  expect(enableIosFormSheet(enabled)).toBe(enabled);
});
