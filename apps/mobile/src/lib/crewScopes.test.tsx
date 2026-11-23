import { RegistryContext } from "@effect/atom-react";
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  PlayerId,
  groupScope,
  type GroupListItem,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import * as Atom from "effect/reactivity/Atom";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const listed = (id: GroupId) =>
  ({
    group: {
      id,
      name: "Crew",
      currency: CurrencyCode.make("USD"),
      createdAt: DateTime.makeUnsafe("2026-11-15T12:00:00Z"),
    },
    role: "member",
    myPlayerId: PlayerId.make(crypto.randomUUID()),
    myBalance: MinorUnits.make(0),
    liveSessionCount: 0,
    liveTripIds: [],
    currentTripId: null,
    trips: [],
    mySession: null,
  }) satisfies GroupListItem;

const render = async (groups: ReadonlyArray<GroupListItem>) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let activityReads = 0;

  const activity = Atom.make(() => {
    activityReads += 1;

    return AsyncResult.success({
      items: groups.map((item) => ({ group: { id: item.group.id } })),
      nextCursor: null,
    });
  });

  vi.doMock("./stacks", () => ({
    useStacks: () => ({
      groups: Atom.make(AsyncResult.success(groups)),
      crewActivity: () => activity,
    }),
  }));

  vi.resetModules();
  const { useCrewScopes } = await import("./crewScopes");
  const Probe = () => <span>{JSON.stringify(useCrewScopes())}</span>;
  const host = document.createElement("div");
  const root = createRoot(host);
  const registry = AtomRegistry.make();

  await act(async () =>
    root.render(
      <RegistryContext value={registry}>
        <Probe />
      </RegistryContext>,
    ),
  );

  const scopes: ReadonlyArray<string> = JSON.parse(host.textContent ?? "null");
  await act(async () => root.unmount());

  return { scopes, activityReads };
};

it("doesn't fetch the activity feed just to watch, when there are no groups", async () => {
  const { scopes, activityReads } = await render([]);

  expect(scopes).toEqual([]);
  expect(activityReads).toBe(0);
});

it("watches the groups in the activity feed once there are groups", async () => {
  const id = GroupId.make(crypto.randomUUID());
  const { scopes, activityReads } = await render([listed(id)]);

  expect(scopes).toEqual([groupScope(id)]);
  expect(activityReads).toBe(1);
});
