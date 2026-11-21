import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const ALL_STEPS = [
  "empty-tabs-and-map-you",
  "landing-tab-clearance",
  "you-sheet-pickers-and-venue",
  "past-session-date-time",
  "invalid-table-deeplink",
  "live-felt-sheets-and-swaps",
];

const APP_SCHEMES = new Map([
  ["com.stephencombs.colorup.dev", "stacks-dev"],
  ["com.stephencombs.colorup.preview", "stacks-preview"],
  ["com.stephencombs.colorup", "stacks"],
]);

const USAGE =
  "Use pnpm verify:ios-ui-audit <build-id> [--preflight] [--metro-url <https://...>] [--out-dir <dir>] [--only <steps>] [--device <name>] [--max-minutes <n>].";

const ALLOWED_STEPS = new Set(ALL_STEPS);
const UUID_RE = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const URL_RE = /^https?:\/\/.+/i;

/** Parses CLI flags and build ID for the iOS UI audit verification script. */
export function parseCliArgs(argv) {
  let buildId = null;
  let preflight = false;
  let metroUrl = null;
  let outDir = join(tmpdir(), `color-up-ios-ui-audit-${Date.now()}`);
  let only = null;
  let deviceName = "iPhone 17 Pro";
  let maxMinutes = 10;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--preflight") {
      preflight = true;
    } else if (arg === "--metro-url") {
      const value = argv[++i];

      if (!value || !URL_RE.test(value)) {
        throw new Error(`Invalid --metro-url value.\n${USAGE}`);
      }

      metroUrl = value;
    } else if (arg === "--out-dir") {
      const value = argv[++i];

      if (!value) throw new Error(`Missing --out-dir value.\n${USAGE}`);
      outDir = resolve(value);
    } else if (arg === "--only") {
      const value = argv[++i];

      if (!value) throw new Error(`Missing --only value.\n${USAGE}`);
      const selected = new Set();

      for (const item of value.split(",")) {
        const trimmed = item.trim();

        if (!trimmed) continue;

        if (!ALLOWED_STEPS.has(trimmed)) {
          throw new Error(
            `Unknown verification step "${trimmed}". Valid steps: ${ALL_STEPS.join(", ")}.`,
          );
        }

        selected.add(trimmed);
      }

      if (selected.size === 0) throw new Error(`No steps specified for --only.\n${USAGE}`);
      only = selected;
    } else if (arg === "--device") {
      const value = argv[++i];

      if (!value) throw new Error(`Missing --device value.\n${USAGE}`);
      deviceName = value;
    } else if (arg === "--max-minutes") {
      const value = Number(argv[++i]);

      if (!Number.isInteger(value) || value < 1 || value > 115) {
        throw new Error(`--max-minutes must be an integer between 1 and 115.\n${USAGE}`);
      }

      maxMinutes = value;
    } else if (arg?.startsWith("-")) {
      throw new Error(`Unknown option "${arg}".\n${USAGE}`);
    } else if (buildId === null && arg) {
      buildId = arg;
    } else {
      throw new Error(`Unexpected argument "${arg}".\n${USAGE}`);
    }
  }

  if (!buildId || !UUID_RE.test(buildId)) {
    throw new Error(USAGE);
  }

  return { buildId, preflight, metroUrl, outDir, only, deviceName, maxMinutes };
}

/** Resolves the expected URL scheme for a built Color Up bundle identifier. */
export function resolveAppConfig(appIdentifier) {
  const scheme = APP_SCHEMES.get(appIdentifier);

  if (!scheme) {
    throw new Error(`Unsupported iOS bundle identifier: ${appIdentifier}`);
  }

  return { appId: appIdentifier, scheme };
}

/** Builds `eas simulator:start` arguments for either static or Metro-connected verification. */
export function buildStartArgs(
  buildId,
  scheme,
  name,
  deviceName = "iPhone 17 Pro",
  maxMinutes = 10,
  idleMinutes = 3,
  metroUrl = null,
) {
  const args = [
    "simulator:start",
    "--platform",
    "ios",
    "--type",
    "agent-device",
    "--device",
    deviceName,
    "--name",
    name,
    "--build-id",
    buildId,
    "--max-duration-minutes",
    String(maxMinutes),
    "--max-idle-time-minutes",
    String(idleMinutes),
    "--json",
    "--non-interactive",
  ];

  if (metroUrl) {
    args.push(
      "--launch-arg",
      "-EXDevMenuIsOnboardingFinished",
      "--launch-arg",
      "1",
      "--launch-arg",
      "-EXDevMenuShowsAtLaunch",
      "--launch-arg",
      "0",
      "--launch-arg",
      "-EXDevMenuShowFloatingActionButton",
      "--launch-arg",
      "0",
      "--open-url",
      `${scheme}://expo-development-client/?url=${encodeURIComponent(metroUrl)}`,
    );
  }

  return args;
}

/** Finds the `@eN` interactive element ref matching `labelMatcher` in an `agent-device snapshot`. */
export function findInteractiveRef(tree, labelMatcher, rolePattern = null, last = false) {
  const lines = tree.split(/\r?\n/);
  const matches = [];

  for (const line of lines) {
    const refMatch = line.match(/@e\d+(?:~\w+)?/);

    if (!refMatch) continue;
    const quoted = line.match(/"([^"]*)"/)?.[1] ?? "";

    const textHit =
      labelMatcher instanceof RegExp
        ? labelMatcher.test(quoted) || labelMatcher.test(line)
        : quoted === labelMatcher;

    if (!textHit) continue;

    if (rolePattern && !rolePattern.test(line)) continue;
    matches.push(refMatch[0]);
  }

  if (matches.length === 0) return null;

  return last ? matches.at(-1) : matches[0];
}

/** Fails if a plain screen rendered the phantom "Show screen details" HeaderTitle dropdown. */
export function assertNoPhantomChevron(tree, screenLabel) {
  assert.doesNotMatch(
    tree,
    /Show screen details/i,
    `Expected no phantom HeaderTitle dropdown on ${screenLabel}.\n${tree}`,
  );
}

/** Fails if a sub-minute finished session displays an extrapolated hourly rate. */
export function assertNoSubMinuteHourly(tree) {
  assert.doesNotMatch(
    tree,
    /\/hr\b|per hour/i,
    `Expected sub-minute finished session to hide hourly rate.\n${tree}`,
  );
}

const packageBin = (file) => {
  const bin = process.env.PATH?.split(delimiter)
    .map((directory) => resolve(directory, "..", file))
    .find(existsSync);

  assert.ok(bin, "Run this script via pnpm verify:ios-ui-audit.");

  return bin;
};

const settle = (ms) => new Promise((done) => setTimeout(done, ms));

const extractQuotedText = (line) => line.match(/"([^"]*)"/)?.[1] ?? "";

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const mobile = fileURLToPath(new URL("../apps/mobile/", import.meta.url));
  const dotenv = join(mobile, ".env.eas-simulator");
  const account = "combsdev";
  const startOverheadMinutes = 5;
  const idleMinutes = 3;
  const sessionName = `Color Up UI audit ${Date.now()}`;
  const easBin = packageBin("eas-cli/bin/run");
  const agentBin = packageBin("agent-device/bin/agent-device.mjs");

  const runBin = (bin, binArgs, options = {}) =>
    execFileSync(process.execPath, [bin, ...binArgs], {
      cwd: mobile,
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 75_000,
      ...options,
    });

  const eas = (...cmdArgs) => runBin(easBin, cmdArgs);

  const activeSessions = () =>
    JSON.parse(
      eas(
        "simulator:list",
        "--status",
        "new",
        "--status",
        "queued",
        "--status",
        "starting",
        "--status",
        "in-progress",
        "--json",
        "--non-interactive",
      ),
    ).sessions;

  const usage = () =>
    JSON.parse(eas("account:usage", account, "--json", "--non-interactive")).simulator.minutes;

  const localSession = () => (existsSync(dotenv) ? parseEnv(readFileSync(dotenv, "utf8")) : {});
  const sessionId = (session) => session?.id ?? session?.sessionId ?? session?.simulatorSessionId;
  const build = JSON.parse(eas("build:view", cli.buildId, "--json"));

  assert.equal(build.status, "FINISHED");
  assert.equal(build.platform, "IOS");
  assert.equal(build.isForIosSimulator, true);
  assert.equal(build.app?.ownerAccount?.name, account);
  assert.ok(new Date(build.expirationDate) > new Date(), "The build artifact has expired.");

  const { appId, scheme } = resolveAppConfig(build.appIdentifier);

  assert.equal(activeSessions().length, 0, "The Expo project already has an active session.");
  assert.ok(!localSession().EAS_SIMULATOR_SESSION_ID, "This checkout points to another session.");

  const before = usage();

  assert.ok(
    before.plan.limit - before.plan.used >= cli.maxMinutes + startOverheadMinutes,
    "The remaining included minutes cannot cover this session's hard limit.",
  );

  console.log(`${before.plan.used.toFixed(2)} of ${before.plan.limit} included minutes used.`);

  if (cli.preflight) process.exit(0);

  mkdirSync(cli.outDir, { recursive: true });

  let id;
  let deviceEnv;
  const captures = [];

  const shouldRun = (step) => cli.only === null || cli.only.has(step);

  const device = (...cmdArgs) =>
    runBin(agentBin, [...cmdArgs, "--platform", "ios"], { env: deviceEnv, timeout: 90_000 });

  const snapshot = (timeout = "20000") =>
    device("snapshot", "-i", "--force-full", "--timeout", timeout);

  const fullSnapshot = (timeout = "45000") =>
    device("snapshot", "--force-full", "--timeout", timeout);

  const control = (...cmdArgs) => eas("simulator:control", ...cmdArgs, "--id", id);
  let currentAppearance = "light";

  const setAppearance = async (mode) => {
    if (currentAppearance === mode) return;

    try {
      device("settings", "appearance", mode);
    } catch (_error) {
      control("appearance.set", mode);
    }

    await settle(350);
    currentAppearance = mode;
  };

  const capture = (file) => {
    const target = join(cli.outDir, `${file}.png`);
    device("screenshot", target, "--pixel-density", "2");
    captures.push(target);

    return target;
  };

  const captureBoth = async (prefix) => {
    const first = currentAppearance;
    const next = first === "light" ? "dark" : "light";
    capture(`${prefix}-${first}`);
    await setAppearance(next);
    capture(`${prefix}-${next}`);
  };

  const press = (
    label,
    rolePattern = /\[(button|popupbutton|switch|tab|menuitem)\]/i,
    last = false,
  ) => {
    const tree = snapshot();
    const ref = findInteractiveRef(tree, label, rolePattern, last);

    assert.ok(ref, `Expected interactive element matching ${label}.\n${tree}`);
    device("press", ref);
  };

  const pressTab = (label) => {
    const tree = snapshot();

    const ref =
      findInteractiveRef(tree, label, /\[tab\]/i) ??
      findInteractiveRef(tree, label, /\[button\]/i, true) ??
      findInteractiveRef(tree, label, null);

    assert.ok(ref, `Expected tab named ${label}.\n${tree}`);
    device("press", ref);
  };

  const closeAnySheet = async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const tree = snapshot("15000");

      const closeRef =
        findInteractiveRef(tree, /^Close/i, /\[button\]/i) ??
        findInteractiveRef(tree, "Done", /\[button\]/i) ??
        findInteractiveRef(tree, "Cancel", /\[button\]/i);

      if (!closeRef) return;
      device("press", closeRef);
      await settle(350);
    }
  };

  const waitForText = async (pattern, timeoutMs = 45_000) => {
    const end = Date.now() + timeoutMs;

    while (Date.now() < end) {
      const remaining = end - Date.now();
      const snapTimeout = String(Math.min(45_000, Math.max(15_000, remaining)));
      let tree;

      try {
        tree = fullSnapshot(snapTimeout);
      } catch (error) {
        const message = error.stderr?.trim() || error.message || "";

        if (/timed out/i.test(message) && Date.now() < end) {
          await settle(500);
          continue;
        }

        throw error;
      }

      const matched = pattern instanceof RegExp ? pattern.test(tree) : tree.includes(pattern);

      if (matched) return tree;
      await settle(500);
    }

    throw new Error(`Timed out waiting for ${pattern}.\n${fullSnapshot("15000")}`);
  };

  let failure;

  try {
    const started = JSON.parse(
      runBin(
        easBin,
        buildStartArgs(
          cli.buildId,
          scheme,
          sessionName,
          cli.deviceName,
          cli.maxMinutes,
          idleMinutes,
          cli.metroUrl,
        ),
        { timeout: 8 * 60_000 },
      ),
    );

    const local = localSession();
    id =
      sessionId(started) ??
      sessionId(activeSessions().find((session) => session.name === sessionName));
    assert.ok(id, "Expo did not return the session ID.");
    assert.equal(local.EAS_SIMULATOR_SESSION_ID, id, "The controller is for a different session.");
    assert.ok(local.AGENT_DEVICE_DAEMON_BASE_URL && local.AGENT_DEVICE_DAEMON_AUTH_TOKEN);
    deviceEnv = { ...process.env, ...local };
    delete deviceEnv.EXPO_TOKEN;

    if (cli.metroUrl) {
      device("open", appId, "--foreground", "--timeout", "60000");
    } else {
      device("open", appId, "--timeout", "60000");
    }

    await waitForText("No sessions yet", 60_000);

    if (shouldRun("empty-tabs-and-map-you")) {
      const playEmpty = fullSnapshot();
      assertNoPhantomChevron(playEmpty, "Play");
      await captureBoth("01-play-empty");

      pressTab("Stats");
      const statsEmpty = await waitForText("Your stats start here");
      assertNoPhantomChevron(statsEmpty, "Stats");
      await captureBoth("02-stats-empty");

      pressTab("Map");
      const mapEmpty = await waitForText("No casinos on the map yet");
      assertNoPhantomChevron(mapEmpty, "Map");
      assert.ok(
        findInteractiveRef(mapEmpty, "You", /\[button\]/i),
        `Expected You button on EmptyMap.\n${mapEmpty}`,
      );
      await captureBoth("03-map-empty");

      pressTab("Play");
      await waitForText("No sessions yet");
    }

    if (shouldRun("landing-tab-clearance")) {
      pressTab("Crew");
      await waitForText("Continue");
      await captureBoth("04-landing-step1");
      press("Continue");
      await waitForText("Log it at the table.");
      await setAppearance("light");
      capture("05-landing-step2-light");
      press("Continue");
      await waitForText("Get started");
      await captureBoth("06-landing-step3");
      press("Get started");
      await waitForText("Record without an account");
      await captureBoth("07-landing-account");
      press("Record without an account");
      await waitForText("No sessions yet");
    }

    if (shouldRun("you-sheet-pickers-and-venue")) {
      press("You");
      const youTree = await waitForText("Recording defaults");
      assert.ok(youTree.includes("Default game"), `Expected Default game row.\n${youTree}`);

      const hasAppearanceAtTop = youTree.includes("Appearance") && youTree.includes("System");

      if (hasAppearanceAtTop) {
        assert.ok(
          !youTree.includes("Match system"),
          `Unexpected Match system theme label.\n${youTree}`,
        );
      }

      await captureBoth("08-you-top");

      press(/Default casino/i, /\[button\]/i);
      const venueTree = await waitForText("Search casinos");
      assert.ok(venueTree.includes("Not set"), `Expected Not set option.\n${venueTree}`);
      assert.ok(
        !venueTree.includes("Not listed"),
        `Unexpected Not listed option in default casino.\n${venueTree}`,
      );
      await captureBoth("09-you-default-venue");

      if (!hasAppearanceAtTop) {
        press(/Default casino/i, /\[button\]/i);
        let appearanceTree = fullSnapshot();

        if (!appearanceTree.includes("Appearance") || !appearanceTree.includes("System")) {
          device("scroll", "down", "0.45");
          appearanceTree = fullSnapshot();
        }

        assert.ok(
          appearanceTree.includes("Appearance") && appearanceTree.includes("System"),
          `Expected Appearance and System theme label.\n${appearanceTree}`,
        );
        assert.ok(
          !appearanceTree.includes("Match system"),
          `Unexpected Match system theme label.\n${appearanceTree}`,
        );
        await captureBoth("09b-you-appearance");
      }

      await closeAnySheet();
    }

    if (shouldRun("past-session-date-time")) {
      await setAppearance("light");
      press("Start or add a session");
      await waitForText("Add past session");
      capture("10-play-fab-menu-light");
      press("Add past session");
      const pastTree = await waitForText("Finished the next day");
      assert.ok(pastTree.includes("Started") && pastTree.includes("Finished"));
      await captureBoth("11-past-session-sheet");

      await setAppearance("light");
      const startedRef = findInteractiveRef(snapshot(), /^Started/i, /\[button\]/i);

      if (startedRef) {
        device("press", startedRef);
        await waitForText("Done");
        capture("12-past-time-popover-light");
        press("Done");
      }

      await closeAnySheet();
    }

    if (shouldRun("invalid-table-deeplink")) {
      device("open", `${scheme}://tables/not-a-uuid`, "--timeout", "20000");

      try {
        device("alert", "accept", "2500");
      } catch (_error) {
        await settle(250);
      }

      try {
        const openRef = findInteractiveRef(snapshot("15000"), "Open", /\[button\]/i);

        if (openRef) device("press", openRef);
      } catch (_error) {
        await settle(250);
      }

      const missingTree = await waitForText("Back to your play", 30_000);
      assert.ok(missingTree.includes("This table isn't on this device"));
      await captureBoth("13-missing-table");
      press("Back to your play");
      await waitForText("No sessions yet");
    }

    if (shouldRun("live-felt-sheets-and-swaps")) {
      press("Start or add a session");
      press("Start session");
      await waitForText("Buy-in");
      await captureBoth("14-start-sheet");

      for (const digit of "200") press(digit, /\[button\]/i);
      press("Start session");
      const liveTree = await waitForText(/\$200/);
      assertNoPhantomChevron(liveTree, "Live Play");
      await captureBoth("15-live-felt");

      await setAppearance("light");
      press("+ $100");
      const toastTree = await waitForText(/Rebuy of \$100 recorded\./);
      assert.ok(toastTree.includes("$300"));
      capture("16-live-rebuy-toast-light");

      if (findInteractiveRef(snapshot(), "Table actions", /\[(button|popupbutton)\]/i)) {
        press("Table actions");
        await waitForText("Edit my session");
        capture("17-live-actions-menu-light");
        press("Edit my session");
      } else {
        press("Edit my session");
      }

      await waitForText("Buy-in total");
      await captureBoth("18-edit-session-sheet");

      press(/^Buy-in total/i);
      const buyInTree = await waitForText("Edit buy-in");
      assert.ok(
        findInteractiveRef(buyInTree, "Back", /\[button\]/i),
        `Expected Back button on Buy-in child sheet.\n${buyInTree}`,
      );
      await captureBoth("19-edit-buyin-child");

      press("Back", /\[button\]/i);
      const returnedToEdit = await waitForText("Buy-in total");
      assert.ok(returnedToEdit.includes("Edit my session"));

      press(/^Game/i);
      const gameTree = await waitForText("Save game");
      assert.ok(
        findInteractiveRef(gameTree, "Back", /\[button\]/i),
        `Expected Back button on Game child sheet.\n${gameTree}`,
      );
      await captureBoth("20-edit-game-child");

      press("Back", /\[button\]/i);
      await waitForText("Edit my session");
      press("Done");
      await waitForText(/\$300/);

      press("Other");
      await waitForText("Add rebuy");
      await captureBoth("21-rebuy-sheet");
      await closeAnySheet();

      press("Cash out");
      await waitForText("End session");

      for (const digit of "450") press(digit, /\[button\]/i);
      await captureBoth("22-cash-out-sheet");
      press("End session");

      const finishedTree = await waitForText(/\+\$150/);
      assertNoSubMinuteHourly(finishedTree);
      assert.ok(
        finishedTree.includes("Back at the table") && finishedTree.includes("Undo cash-out"),
        `Expected Back at the table and Undo cash-out.\n${finishedTree}`,
      );
      await captureBoth("23-finished-session");

      const backPlayRef = findInteractiveRef(snapshot(), /^Back to (your play|Play)/i);
      assert.ok(backPlayRef);
      device("press", backPlayRef);
      await waitForText("Recent sessions");
      await captureBoth("24-play-populated");

      press(/^See all/i, /\[button\]/i);
      const historyTree = await waitForText("All sessions");
      assertNoPhantomChevron(historyTree, "All sessions");
      await captureBoth("25-history");
    }

    const summary = {
      buildId: cli.buildId,
      appId,
      deviceName: cli.deviceName,
      captures,
    };

    writeFileSync(join(cli.outDir, "manifest.json"), JSON.stringify(summary, null, 2));
    console.log(`Captured ${captures.length} iOS audit screenshots into ${cli.outDir}`);
  } catch (error) {
    failure = error;

    try {
      const labels = fullSnapshot("15000")
        .split(/\r?\n/)
        .map(extractQuotedText)
        .filter(Boolean)
        .slice(0, 40)
        .join(" | ");

      console.error(`Last tree snapshot failure:\n${labels}`);
    } catch (_ignored) {
      console.error("Could not read fallback snapshot on failure.");
    }
  } finally {
    try {
      id ??= sessionId(activeSessions().find((session) => session.name === sessionName));

      if (id) eas("simulator:stop", "--id", id, "--non-interactive");
      rmSync(dotenv, { force: true });
      const after = usage();
      console.log(
        `${after.plan.used.toFixed(2)} of ${after.plan.limit} included minutes used. Captures: ${cli.outDir}`,
      );
    } catch (cleanupErr) {
      console.error(
        `Cleanup or usage check failed: ${cleanupErr.stderr?.trim() || cleanupErr.message}`,
      );
      failure ??= cleanupErr;
    }
  }

  if (failure) {
    console.error(failure.stderr?.trim() || failure.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
