import { localDateText } from "@stacks/client-runtime/recordingView";

export type DateTimeKind = "date" | "time";

export const fieldText = (value: Date, kind: DateTimeKind) =>
  kind === "date"
    ? localDateText(value)
    : `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;

export const fieldDate = (value: string, kind: DateTimeKind) => {
  if (!(kind === "date" ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{2}:\d{2}$/).test(value)) return null;
  const date = new Date(kind === "date" ? `${value}T00:00:00` : `2000-01-01T${value}:00`);
  return Number.isFinite(date.getTime()) && fieldText(date, kind) === value ? date : null;
};

export const fieldDisplay = (value: string, kind: DateTimeKind) => {
  const date = fieldDate(value, kind);
  return date
    ? kind === "date"
      ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : kind === "date"
      ? "Choose date"
      : "Choose time";
};
