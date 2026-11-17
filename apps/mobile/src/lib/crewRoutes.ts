import { CommonActions, StackActions } from "@react-navigation/native";
import type { GroupId } from "@stacks/contracts";

/** Crew's stack once you've left a group: its first screen, with nothing above it to go back into. */
export const afterLeavingGroup = () => StackActions.popToTop();

/**
 * Crew's stack once a trip is deleted. The trip's page is gone, so the group it belonged to takes
 * its place, whether the trip was opened from the group or straight from Crew.
 */
export const afterDeletingTrip = (groupId: GroupId) =>
  CommonActions.reset({
    index: 1,
    routes: [{ name: "Crew" }, { name: "Group", params: { groupId } }],
  });
