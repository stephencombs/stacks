import { useAtomValue } from "@effect/atom-react";
import { crewScopes } from "@stacks/client-runtime/crew";
import * as Atom from "effect/reactivity/Atom";
import * as AsyncResult from "effect/reactivity/AsyncResult";

import { useStacks } from "./stacks";

const noActivity = Atom.make(AsyncResult.initial());

/**
 * The groups Crew watches: the pinned trip's, then those in the activity feed so far. With no
 * groups there's no feed to read, so it isn't fetched just to find scopes.
 */
export function useCrewScopes() {
  const stacks = useStacks();
  const groups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []);
  const feed = groups.length === 0 ? noActivity : stacks.crewActivity();
  const activity = AsyncResult.getOrElse(useAtomValue(feed), () => null);

  return crewScopes(groups, activity?.items ?? []);
}
