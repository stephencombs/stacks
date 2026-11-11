import { describe, expect, it } from "vite-plus/test";
import { fieldDate, fieldText } from "./dateTimeValue";

describe("native date/time field values", () => {
  it("keeps local calendar dates and clock times without UTC conversion", () => {
    const date = new Date(2026, 10, 7, 23, 45);
    expect(fieldText(date, "date")).toBe("2026-11-07");
    expect(fieldText(date, "time")).toBe("23:45");
    expect(fieldDate("2026-11-07", "date")?.getDate()).toBe(7);
    expect(fieldDate("00:05", "time")?.getHours()).toBe(0);
    expect(fieldDate("00:05", "time")?.getMinutes()).toBe(5);
  });

  it("keeps unset fields unset and rejects normalized invalid dates or times", () => {
    expect(fieldDate("", "time")).toBeNull();
    expect(fieldDate("", "date")).toBeNull();
    expect(fieldDate("2026-02-30", "date")).toBeNull();
    expect(fieldDate("24:00", "time")).toBeNull();
    expect(fieldDate("12:60", "time")).toBeNull();
  });
});
