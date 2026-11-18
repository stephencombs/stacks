import { describe, expect, it } from "vite-plus/test";
import { fieldDate, fieldDisplay, fieldText, pickerStart, pickerText } from "./dateTimeValue";

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

describe("a time field's display", () => {
  it("follows the phone's 12 or 24-hour setting when it says", () => {
    expect(fieldDisplay("21:30", "time", true)).toContain("21:30");
    expect(fieldDisplay("21:30", "time", false)).toMatch(/9:30\s?PM/i);
  });
});

describe("Material picker values", () => {
  it("round-trips a calendar day through UTC midnight in any time zone", () => {
    const start = pickerStart("2026-11-07", "date");
    expect(start).toBe("2026-11-07T00:00:00.000Z");
    expect(pickerText(new Date(start), "date")).toBe("2026-11-07");
  });

  it("starts an unset field on today, or now", () => {
    const now = new Date(2026, 10, 7, 9, 5);
    expect(pickerStart("", "date", now)).toBe("2026-11-07T00:00:00.000Z");
    expect(pickerStart("", "time", now)).toBe(now.toISOString());
    expect(pickerText(new Date(pickerStart("09:05", "time")), "time")).toBe("09:05");
  });
});
