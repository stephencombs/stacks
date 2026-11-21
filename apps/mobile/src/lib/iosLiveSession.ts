import type { LiveSessionSurface } from "@stacks/client-runtime/liveSessionSurface";
import { after } from "expo-widgets";

import {
  sessionActivity,
  sessionActivityColors,
  type SessionActivityContent,
} from "./sessionActivity";

const RESULT_DISPLAY_MS = 5 * 60_000;
let tracked: { activityId: string; visitId: string } | undefined;

export async function dispatchIosLiveSession(
  surface: LiveSessionSurface,
  colorScheme: "light" | "dark" | null,
): Promise<void> {
  const instances = sessionActivity.getInstances();
  const previous = tracked;
  const current =
    surface.kind === "idle" || surface.visitId !== previous?.visitId
      ? undefined
      : instances.find((instance) => instance.getId() === previous.activityId);

  for (const instance of instances) {
    if (instance !== current) await instance.end("immediate");
  }
  if (surface.kind === "idle") {
    tracked = undefined;
    return;
  }

  if (surface.kind === "finished") {
    await current?.end(after(new Date(Date.now() + RESULT_DISPLAY_MS)), {
      kind: "finished",
      gameLabel: surface.gameLabel,
      colors: sessionActivityColors,
      colorScheme,
      finishedTimeText: surface.finishedTimeText,
      resultText: surface.resultText,
      resultTone:
        surface.privacyMode || surface.result === 0
          ? "neutral"
          : surface.result > 0
            ? "win"
            : "loss",
      durationText: surface.durationText,
      buyInText: surface.buyInText,
      cashOutText: surface.cashOutText,
      hourlyText: surface.hourlyText,
      seeSessionUrl: surface.deepLinks.seeSession,
    });
    tracked = undefined;
    return;
  }

  const openUrl = surface.deepLinks.open;
  const content: SessionActivityContent = {
    kind: "live",
    gameLabel: surface.gameLabel,
    colors: sessionActivityColors,
    colorScheme,
    venueLabel: surface.venueLabel,
    buyInText: surface.buyInText,
    startedAtMs: surface.startedAtMs,
    openUrl,
    cashOutUrl: surface.deepLinks.cashOut,
  };
  if (current) {
    await current.update(content);
  } else {
    const instance = sessionActivity.start(content, openUrl);
    tracked = { activityId: instance.getId(), visitId: surface.visitId };
  }
}
