import * as Predicate from "effect/Predicate";

type Stack = {
  readonly index?: number | undefined;
  readonly routes: ReadonlyArray<{ readonly name: string }>;
};

function isReopenedTable(route: { readonly name: string }, tableId: string) {
  if (route.name !== "Table" || !("params" in route)) return false;

  const params = route.params;

  return Predicate.hasProperty(params, "tableId") && Predicate.isString(params.tableId)
    ? params.tableId === tableId
    : false;
}

/**
 * A stack without the overview of one table. Reopening your visit puts you back in play, where the
 * session shows the table itself; the overview under it would only offer a second way back to it.
 */
export const withoutTable = <State extends Stack>(state: State, tableId: string) => {
  const routes = state.routes.filter((route) => !isReopenedTable(route, tableId));

  return { ...state, routes, index: routes.length - 1 };
};
