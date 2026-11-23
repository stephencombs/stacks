import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const Tags = Schema.fromJsonString(Schema.Array(Schema.String));

/** Tags as the Worker sends them to the object. */
export const writeTags = Schema.encodeSync(Tags);

/** The tags a request carries, none when its header is missing or isn't a list of strings. */
export const readTags = (header: string | null) =>
  Option.getOrElse(Schema.decodeUnknownOption(Tags)(header), () => []);

/** What a socket was authorized through. Ids only: never a token, a secret or a link. */
export interface Grant {
  readonly userId?: string | undefined;
  readonly actorId?: string | undefined;
  /** The `tables.share_token_hash` of the link it presented. */
  readonly shareHash?: string | undefined;
  /** The group that let a signed-in account look at a table it plays no part in. */
  readonly groupId?: string | undefined;
}

/** Which of a scope's sockets to close. */
export type Selector =
  | { readonly kind: "all" }
  | { readonly kind: "user"; readonly userId: string }
  | { readonly kind: "actor"; readonly actorId: string }
  | { readonly kind: "share"; readonly shareHash: string }
  | { readonly kind: "group"; readonly groupId: string }
  | { readonly kind: "member"; readonly groupId: string; readonly userId: string };

const id = (value: string) => value.toLowerCase();

/** The tag `getWebSockets` finds a selector's sockets by, or null for every socket. */
export const tagOf = (selector: Selector) => {
  switch (selector.kind) {
    case "all":
      return null;
    case "user":
      return `user:${selector.userId}`;
    case "actor":
      return `actor:${id(selector.actorId)}`;
    case "share":
      return `share:${selector.shareHash}`;
    case "group":
      return `group:${id(selector.groupId)}`;
    case "member":
      return `member:${id(selector.groupId)}:${selector.userId}`;
  }
};

/**
 * A socket's tags, at most 10 of up to 256 characters each. Each one is a selector a revocation
 * can name, so a close finds the socket without anyone storing who it belongs to.
 */
export const tagsOf = ({ userId, actorId, shareHash, groupId }: Grant) => {
  const selectors: Array<Selector> = [];

  if (userId !== undefined) selectors.push({ kind: "user", userId });

  if (actorId !== undefined) selectors.push({ kind: "actor", actorId });

  if (shareHash !== undefined) selectors.push({ kind: "share", shareHash });

  if (groupId !== undefined) {
    selectors.push({ kind: "group", groupId });

    if (userId !== undefined) selectors.push({ kind: "member", groupId, userId });
  }

  return selectors.flatMap((selector) => tagOf(selector) ?? []);
};
