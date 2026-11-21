import * as Effect from "effect/Effect";
import type { SessionId } from "@stacks/contracts";

import * as Access from "./Access.ts";
import * as Views from "./Views.ts";

export const get = Effect.fn("Sessions.get")(function* (sessionId: SessionId) {
  const session = yield* Views.loadSession(sessionId);
  yield* Access.membership(session.groupId);
  return yield* Views.sessionDetail(sessionId);
});
