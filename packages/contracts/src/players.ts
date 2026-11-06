import * as Schema from "effect/Schema";

import { ActorId, PlayerId, UserId } from "./ids.ts";

export const PlayerIdentity = Schema.Struct({
  id: PlayerId,
  displayName: Schema.NonEmptyString,
});
export type PlayerIdentity = typeof PlayerIdentity.Type;

export const Actor = Schema.Struct({
  id: ActorId,
  userId: Schema.NullOr(UserId),
});
export type Actor = typeof Actor.Type;
