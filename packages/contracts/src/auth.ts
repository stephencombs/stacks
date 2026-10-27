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
