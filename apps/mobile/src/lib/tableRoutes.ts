type Stack = {
  readonly index?: number | undefined;
  readonly routes: ReadonlyArray<{ readonly name: string; readonly params?: object | undefined }>;
};

/**
 * A stack without the overview of one table. Reopening your visit puts you back in play, where the
 * session shows the table itself; the overview under it would only offer a second way back to it.
 */
export const withoutTable = <State extends Stack>(state: State, tableId: string): State => {
  const routes = state.routes.filter(
    (route) =>
      !(
        route.name === "Table" &&
        (route.params as { tableId?: string } | undefined)?.tableId === tableId
      ),
  );
  return { ...state, routes, index: routes.length - 1 };
};
