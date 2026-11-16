import { describe, expect, it } from "vite-plus/test";

import { oldAddress } from "./oldAddresses";

describe("oldAddress", () => {
  it("opens Stats with the trip picked from a trip's Board or Results", () => {
    expect(oldAddress("trips/t1/board")).toBe("stats?tripId=t1");
    expect(oldAddress("/trips/t1/board?scope=all")).toBe("stats?tripId=t1");
    expect(oldAddress("trips/t1/results")).toBe("stats?tripId=t1");
  });

  it("opens Stats with the group picked from a group's Stats", () => {
    expect(oldAddress("/groups/g1/stats")).toBe("stats?groupId=g1");
  });

  it("leaves every other address alone", () => {
    expect(oldAddress("trips/t1")).toBe("trips/t1");
    expect(oldAddress("/groups/g1")).toBe("/groups/g1");
    expect(oldAddress("stats")).toBe("stats");
  });
});
