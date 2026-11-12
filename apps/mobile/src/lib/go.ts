import { useNavigation } from "@react-navigation/native";
import type { GroupId, SessionId, TripId } from "@stacks/contracts";

import { useScope } from "./scope";

type PlacesParams = NonNullable<
  Extract<ReactNavigation.RootParamList["Account"], { screen: "Places" }>["params"]
>;

/**
 * Ways into the places from anywhere. A session and a new session push onto Sessions, and a
 * group's people and settings onto Group, each over its place so back lands there.
 */
export function useGo() {
  const navigation = useNavigation();
  const { setTrip, setGroup } = useScope();
  const places = (params: PlacesParams) =>
    navigation.navigate("Account", { screen: "Places", params });
  return {
    session: (sessionId: SessionId) =>
      places({
        screen: "SessionsTab",
        params: { screen: "Session", params: { sessionId }, initial: false },
      }),
    newSession: (tripId: TripId, from?: SessionId) =>
      places({
        screen: "SessionsTab",
        params: {
          screen: "NewSession",
          params: { tripId, ...(from ? { from } : {}) },
          initial: false,
        },
      }),
    /** Puts a trip in scope and opens one of its places. */
    trip: (tripId: TripId, place: "Sessions" | "Board" = "Sessions") => {
      setTrip(tripId);
      if (place === "Board") places({ screen: "BoardTab", params: { screen: "Board" } });
      else places({ screen: "SessionsTab", params: { screen: "Sessions" } });
    },
    /** Puts a group in scope and opens its hub. */
    group: (groupId: GroupId) => {
      setGroup(groupId);
      places({ screen: "GroupTab", params: { screen: "Group" } });
    },
    people: (groupId: GroupId) =>
      places({
        screen: "GroupTab",
        params: { screen: "People", params: { groupId }, initial: false },
      }),
    settings: (groupId: GroupId) =>
      places({
        screen: "GroupTab",
        params: { screen: "GroupSettings", params: { groupId }, initial: false },
      }),
  };
}
