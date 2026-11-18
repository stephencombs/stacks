import { CommonActions, StackRouter } from "@react-navigation/routers";
import { GroupId } from "@stacks/contracts";
import { expect, it, vi } from "vite-plus/test";

// The real stack reducer, without the native package around it.
vi.mock("@react-navigation/native", async () => await import("@react-navigation/routers"));

const { afterDeletingTrip, afterLeavingGroup } = await import("./crewRoutes");

const groupId = GroupId.make("0192e7a0-0000-7000-8000-000000000001");
const routeNames = ["Crew", "Group", "GroupSettings", "Sessions"];
const router = StackRouter({ initialRouteName: "Crew" });
const options = { routeNames, routeParamList: {}, routeGetIdList: {} };

/** Crew's stack with these screens pushed, in order. */
const stack = (...names: ReadonlyArray<string>) => {
  let state = router.getInitialState(options);
  for (const name of names)
    state = router.getStateForAction(
      state,
      { type: "PUSH", payload: { name, params: { groupId } } },
      options,
    ) as typeof state;
  return state;
};
const names = (state: { routes: ReadonlyArray<{ name: string }> } | null | undefined) =>
  state?.routes?.map((route) => route.name);

it("leaves a group for Crew's first screen, with nothing above it to go back into", () => {
  const settings = stack("Group", "GroupSettings");
  // Navigating to Crew from here pushes a second Crew over the settings of the group just left.
  expect(
    names(router.getStateForAction(settings, CommonActions.navigate("Crew"), options)),
  ).toEqual(["Crew", "Group", "GroupSettings", "Crew"]);
  expect(names(router.getStateForAction(settings, afterLeavingGroup(), options))).toEqual(["Crew"]);
});

it("goes back to the group after deleting a trip opened from it", () => {
  const next = router.getStateForAction(
    stack("Group", "Sessions"),
    afterDeletingTrip(groupId),
    options,
  );
  expect(names(next)).toEqual(["Crew", "Group"]);
});

it("puts the group in the trip's place when the trip was opened straight from Crew", () => {
  const next = router.getStateForAction(stack("Sessions"), afterDeletingTrip(groupId), options);
  expect(names(next)).toEqual(["Crew", "Group"]);
  expect(next?.routes[1]?.params).toEqual({ groupId });
});
