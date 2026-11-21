import type {
  LiveSessionSurfaceFinished,
  LiveSessionSurfaceLive,
} from "@stacks/client-runtime/liveSessionSurface";
import { expect, it, vi } from "vite-plus/test";

const { factory, activity } = vi.hoisted(() => {
  const activity = { getId: () => "activity", update: vi.fn(), end: vi.fn() };
  return { factory: { getInstances: vi.fn(), start: vi.fn(() => activity) }, activity };
});

vi.mock("expo-widgets", () => ({ after: (date: Date) => ({ after: date }) }));
vi.mock("./sessionActivity", () => ({ sessionActivity: factory, sessionActivityColors: {} }));

import { dispatchIosLiveSession } from "./iosLiveSession";

const open = "stacks-dev://play/session";
const live = {
  kind: "live",
  visitId: "session",
  gameLabel: "Blackjack",
  venueLabel: "Casino",
  buyInText: "$100",
  startedAtMs: 1000,
  deepLinks: { open, rebuy100: open, rebuy200: open, cashOut: `${open}?action=cash_out` },
} as LiveSessionSurfaceLive;

it("starts, updates, finishes, reopens, and clears the activity", async () => {
  factory.getInstances.mockReturnValue([]);
  await dispatchIosLiveSession(live, null);
  expect(factory.start).toHaveBeenCalledWith(
    expect.objectContaining({ buyInText: "$100", colorScheme: null }),
    open,
  );

  factory.getInstances.mockReturnValue([activity]);
  await dispatchIosLiveSession({ ...live, buyInText: "$200" }, "dark");
  expect(activity.update).toHaveBeenCalledWith(
    expect.objectContaining({
      buyInText: "$200",
      cashOutUrl: `${open}?action=cash_out`,
      colorScheme: "dark",
    }),
  );

  const finished = {
    kind: "finished",
    visitId: live.visitId,
    gameLabel: live.gameLabel,
    finishedTimeText: "Finished 10:12 PM",
    result: 5000,
    resultText: "+$50",
    durationText: "1h 00m played",
    buyInText: "$200",
    cashOutText: "$250",
    hourlyText: "+$50/hr",
    privacyMode: false,
    deepLinks: { seeSession: open, backAtTable: open },
  } as LiveSessionSurfaceFinished;

  await dispatchIosLiveSession(finished, "light");
  expect(activity.end).toHaveBeenLastCalledWith(
    { after: expect.any(Date) },
    expect.objectContaining({
      resultText: "+$50",
      resultTone: "win",
      colorScheme: "light",
      seeSessionUrl: open,
    }),
  );

  factory.getInstances.mockReturnValue([]);
  await dispatchIosLiveSession(live, null);
  factory.getInstances.mockReturnValue([activity]);
  await dispatchIosLiveSession({ ...finished, privacyMode: true }, null);
  expect(activity.end).toHaveBeenLastCalledWith(
    { after: expect.any(Date) },
    expect.objectContaining({ resultTone: "neutral", colorScheme: null }),
  );

  factory.getInstances.mockReturnValue([]);
  await dispatchIosLiveSession(live, null);
  expect(factory.start).toHaveBeenCalledTimes(3);

  factory.getInstances.mockReturnValue([activity]);
  await dispatchIosLiveSession({ kind: "idle" }, null);
  expect(activity.end).toHaveBeenLastCalledWith("immediate");
});
