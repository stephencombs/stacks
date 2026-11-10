import * as Context from "effect/Context";
import * as HttpApiMiddleware from "effect/http-api/HttpApiMiddleware";
import * as HttpApiSecurity from "effect/http-api/HttpApiSecurity";

import { Unauthorized } from "./errors.ts";
import type { UserId } from "./ids.ts";

export class CurrentUser extends Context.Service<
  CurrentUser,
  {
    readonly userId: UserId;
    readonly displayName: string;
    readonly avatarUrl: string | null;
  }
>()("@stacks/contracts/CurrentUser") {}

/** Verifies the Clerk session token sent as `Authorization: Bearer <token>`. */
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()("@stacks/contracts/Authentication", {
  error: Unauthorized,
  security: { bearer: HttpApiSecurity.bearer },
}) {}

/**
 * Who is recording: a signed-in account, or a device actor that sent
 * `Authorization: Actor <actorId>.<secret>`. The service checks an actor's secret against the
 * database and answers 401 when it doesn't match.
 */
export class Recorder extends Context.Service<
  Recorder,
  | { readonly _tag: "Account"; readonly user: CurrentUser["Service"] }
  | { readonly _tag: "Actor"; readonly actorId: string; readonly secret: string }
>()("@stacks/contracts/Recorder") {}

/** Accepts either an account's session or a device actor's credential. */
export class RecordingAuthentication extends HttpApiMiddleware.Service<
  RecordingAuthentication,
  { provides: Recorder }
>()("@stacks/contracts/RecordingAuthentication", {
  error: Unauthorized,
  security: { bearer: HttpApiSecurity.bearer, actor: HttpApiSecurity.http({ scheme: "Actor" }) },
}) {}
