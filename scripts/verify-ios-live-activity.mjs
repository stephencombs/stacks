import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const [buildId, mode] = process.argv.slice(2);
if (
  !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(buildId ?? "") ||
  (mode && mode !== "--preflight")
) {
  throw new Error("Use pnpm verify:ios-live-activity <build-id> [--preflight].");
}

const mobile = fileURLToPath(new URL("../apps/mobile/", import.meta.url));
const dotenv = join(mobile, ".env.eas-simulator");
const account = "combsdev";
const app = "com.stephencombs.colorup.preview";
const maxMinutes = 10;
const startOverheadMinutes = 5;
const idleMinutes = 3;
const name = `Color Up iOS check ${Date.now()}`;
const output = join(tmpdir(), `color-up-ios-check-${Date.now()}`);

function packageBin(file) {
  const bin = process.env.PATH?.split(delimiter)
    .map((directory) => resolve(directory, "..", file))
    .find(existsSync);
  assert.ok(bin, "Run this script via pnpm verify:ios-live-activity.");
  return bin;
}

const easBin = packageBin("eas-cli/bin/run");
const agentBin = packageBin("agent-device/bin/agent-device.mjs");

function run(bin, args, options = {}) {
  return execFileSync(process.execPath, [bin, ...args], {
    cwd: mobile,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 75_000,
    ...options,
  });
}

const eas = (...args) => run(easBin, args);
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

const build = JSON.parse(eas("build:view", buildId, "--json"));
assert.equal(build.status, "FINISHED");
assert.equal(build.platform, "IOS");
assert.equal(build.isForIosSimulator, true);
assert.equal(build.appIdentifier, app);
assert.equal(build.app?.ownerAccount?.name, account);
assert.ok(new Date(build.expirationDate) > new Date(), "The build artifact has expired.");
assert.equal(activeSessions().length, 0, "The Expo project already has an active session.");
assert.ok(!localSession().EAS_SIMULATOR_SESSION_ID, "This checkout points to another session.");
const before = usage();
assert.ok(
  before.plan.limit - before.plan.used >= maxMinutes + startOverheadMinutes,
  "The remaining included minutes cannot cover this session's hard limit.",
);
console.log(`${before.plan.used.toFixed(2)} of ${before.plan.limit} included minutes used.`);

if (mode === "--preflight") process.exit(0);
mkdirSync(output);

let id;
let deviceEnv;

function device(...args) {
  return run(agentBin, [...args, "--platform", "ios"], { env: deviceEnv });
}

function snapshot(timeout = "8000") {
  return device("snapshot", "-i", "--timeout", timeout);
}

function fullSnapshot(timeout = "8000") {
  return device("snapshot", "--timeout", timeout);
}

function press(label) {
  const tree = snapshot();
  const matching = tree
    .split(/\r?\n/)
    .filter((line) => line.includes(`"${label}"`) && /\[(button|popupbutton)\]/.test(line));
  assert.equal(matching.length, 1, `Expected one button named ${label}.\n${tree}`);
  device("press", matching[0].match(/@e\d+/)[0]);
}

function pressTab(label) {
  const tree = snapshot();
  const lines = tree.split(/\r?\n/);
  const tab =
    lines.find((line) => line.includes(`"${label}"`) && /\[tab\]/i.test(line)) ??
    lines.findLast((line) => line.includes(`"${label}"`) && /\[button\]/i.test(line)) ??
    lines.find((line) => line.includes(`"${label}"`));
  assert.ok(tab, `Expected tab named ${label}.\n${tree}`);
  const ref = tab.match(/@e\d+/)?.[0];
  assert.ok(ref, `Expected ref on tab ${label}: ${tab}`);
  device("press", ref);
}

const control = (...args) => eas("simulator:control", ...args, "--id", id);
const capture = (file) => device("screenshot", join(output, `${file}.png`));
const captureControl = (file) =>
  control("screenshot.capture", "--output", join(output, `${file}.png`));
const settle = (ms) => new Promise((done) => setTimeout(done, ms));

function lock(file) {
  control("button", "lock");
  return captureControl(file);
}

function expandIsland() {
  const gesture = join(output, "expand-island.json");
  writeFileSync(
    gesture,
    JSON.stringify({
      version: 1,
      actions: [
        {
          action: "gesture",
          params: {
            events: [
              { type: "begin", x: 0.69, y: 0.037 },
              { type: "move", x: 0.69, y: 0.037, delayMs: 800 },
              { type: "end", x: 0.69, y: 0.037, delayMs: 50 },
            ],
          },
        },
      ],
    }),
  );
  control("--import", gesture);
  capture("island-expanded");
}

function cashOutFromLockScreen() {
  // A system notification beneath the activity moves the action row up on the iPhone 17 Pro.
  for (const y of ["0.71", "0.805"]) {
    control("tap", "0.79", y);
    try {
      const tree = device("snapshot", "-i", "--observe-only", "--timeout", "3500");
      assert.match(
        tree,
        /Close Cash out/,
        "The activity opened the app without the cash-out sheet.",
      );
      return;
    } catch (error) {
      if (!(error.stderr || error.stdout || "").includes("OBSERVATION_UNAVAILABLE")) throw error;
    }
  }
  throw new Error("Could not open the cash-out keypad from the Lock Screen.");
}

async function main() {
  let failure;
  try {
    const started = JSON.parse(
      run(
        easBin,
        [
          "simulator:start",
          "--platform",
          "ios",
          "--type",
          "agent-device",
          "--device",
          "iPhone 17 Pro",
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
        ],
        { timeout: 8 * 60_000 },
      ),
    );
    const local = localSession();
    id = sessionId(started) ?? sessionId(activeSessions().find((session) => session.name === name));
    assert.ok(id, "Expo did not return the session ID.");
    assert.equal(local.EAS_SIMULATOR_SESSION_ID, id, "The controller is for a different session.");
    assert.ok(local.AGENT_DEVICE_DAEMON_BASE_URL && local.AGENT_DEVICE_DAEMON_AUTH_TOKEN);
    deviceEnv = { ...process.env, ...local };
    delete deviceEnv.EXPO_TOKEN;
    console.log("Connecting the iOS controller.");
    device("open", app, "--timeout", "60000");
    assert.match(fullSnapshot("45000"), /No sessions yet/);
    console.log("Recording a signed-out session.");
    press("Start or add a session");
    press("Start session");
    for (const digit of "200") press(digit);
    press("Start session");
    press("+ $100");
    assert.match(fullSnapshot(), /\$300/);
    capture("live-light");
    control("appearance.set", "dark");
    fullSnapshot();
    capture("live-dark");
    control("appearance.set", "light");
    fullSnapshot();

    console.log("Capturing the Island and Lock Screen.");
    device("home");
    capture("island-compact");
    expandIsland();
    lock("lock-screen-permission");
    control("tap", "0.716", "0.707");
    await settle(600);
    captureControl("lock-live-light");

    console.log("Opening Cash out from the Lock Screen.");
    cashOutFromLockScreen();
    capture("cash-out-light");
    control("appearance.set", "dark");
    fullSnapshot();
    capture("cash-out-dark");
    for (const digit of "450") press(digit);
    const cashOut = fullSnapshot();
    assert.match(cashOut, /End session/);
    assert.match(cashOut, /\+\$150/);
    capture("cash-out-entered-dark");
    press("End session");
    assert.match(fullSnapshot(), /\+\$150/);
    capture("finished-dark");

    console.log("Checking finished Lock Screen persistence in dark and light mode.");
    device("close", app);
    lock("lock-finished-dark");
    control("button", "home");
    control("appearance.set", "light");
    await settle(600);
    lock("lock-finished-light");

    console.log("Capturing Play, Stats, Map, and Crew tabs in light and dark mode.");
    control("button", "home");
    device("open", app, "--timeout", "60000");
    const home = fullSnapshot("25000");
    assert.match(home, /Recent sessions/);
    assert.match(home, /\+\$150/);
    capture("tab-play-light");
    pressTab("Stats");
    fullSnapshot();
    capture("tab-stats-light");
    pressTab("Map");
    fullSnapshot();
    capture("tab-map-light");
    pressTab("Crew");
    fullSnapshot();
    capture("tab-crew-light");

    control("appearance.set", "dark");
    fullSnapshot();
    capture("tab-crew-dark");
    pressTab("Map");
    fullSnapshot();
    capture("tab-map-dark");
    pressTab("Stats");
    fullSnapshot();
    capture("tab-stats-dark");
    pressTab("Play");
    fullSnapshot();
    capture("tab-play-dark");

    console.log("Live Activity, Lock Screen, Cash out, and all light/dark tabs verified.");
  } catch (error) {
    failure = error;
  } finally {
    try {
      id ??= sessionId(activeSessions().find((session) => session.name === name));
      if (id) eas("simulator:stop", "--id", id, "--non-interactive");
      rmSync(dotenv, { force: true });
      const after = usage();
      console.log(
        `${after.plan.used.toFixed(2)} of ${after.plan.limit} included minutes used. Captures: ${output}`,
      );
    } catch (error) {
      console.error(`Cleanup or usage check failed: ${error.stderr?.trim() || error.message}`);
      failure ??= error;
    }
  }

  if (failure) {
    console.error(failure.stderr?.trim() || failure.message);
    process.exitCode = 1;
  }
}

await main();
