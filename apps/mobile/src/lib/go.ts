import { useNavigation } from "@react-navigation/native";
import type { GroupId, SessionId, TripId } from "@stacks/contracts";

import { useScope } from "./scope";

type CrewParams = NonNullable<
  Extract<ReactNavigation.RootParamList["Tabs"], { screen: "CrewTab" }>["params"]
>;

/**
 * Ways into groups and trips from anywhere. Each is pushed onto Crew over its list of groups, so
 * back always lands somewhere in Crew.
 */
export function useGo() {
  const navigation = useNavigation();
  const { setTrip, setGroup } = useScope();
  const crew = (params: CrewParams) => navigation.navigate("Tabs", { screen: "CrewTab", params });
  return {
    session: (sessionId: SessionId) =>
      crew({ screen: "Session", params: { sessionId }, initial: false }),
    newSession: (tripId: TripId, from?: SessionId) =>
      crew({
        screen: "NewSession",
        params: { tripId, ...(from ? { from } : {}) },
        initial: false,
      }),
    /** Puts a trip in scope and opens its sessions or its board. */
    trip: (tripId: TripId, page: "Sessions" | "Board" = "Sessions") => {
      setTrip(tripId);
      crew({ screen: page, params: { tripId }, initial: false });
    },
    /** Puts a group in scope and opens it. */
    group: (groupId: GroupId) => {
      setGroup(groupId);
      crew({ screen: "Group", params: { groupId }, initial: false });
    },
    people: (groupId: GroupId) => crew({ screen: "People", params: { groupId }, initial: false }),
    settings: (groupId: GroupId) =>
      crew({ screen: "GroupSettings", params: { groupId }, initial: false }),
  };
}
