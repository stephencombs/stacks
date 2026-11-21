import { expect, it } from "vite-plus/test";

import { withoutTable } from "./tableRoutes";

interface RouteParams {
  readonly tableId?: string;
  readonly visitId?: string;
}

const route = (name: string, params?: RouteParams) => ({
  key: `${name}-${JSON.stringify(params)}`,
  name,
  params,
});

it("drops the overview of the table you reopened, so Back reaches what was under it", () => {
  const state = {
    index: 2,
    routes: [route("Tabs"), route("Table", { tableId: "a" }), route("Play", { visitId: "v" })],
  };

  expect(withoutTable(state, "a").routes.map((r) => r.name)).toEqual(["Tabs", "Play"]);
  expect(withoutTable(state, "a").index).toBe(1);
});

it("keeps other tables' overviews", () => {
  const state = {
    index: 2,
    routes: [route("Table", { tableId: "b" }), route("Table", { tableId: "a" }), route("Play")],
  };

  expect(withoutTable(state, "a").routes).toHaveLength(2);
});
