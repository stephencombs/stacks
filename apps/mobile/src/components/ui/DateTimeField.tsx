import { TextField } from "./Field";
import type { DateTimeKind } from "./dateTimeValue";

export type DateTimeFieldProps = {
  label: string;
  value: string;
  kind: DateTimeKind;
  onChange: (value: string) => void;
  error?: string | null;
  maximumDate?: Date;
};

export function DateTimeField({ label, value, kind, onChange, error }: DateTimeFieldProps) {
  return (
    <TextField
      label={label}
      value={value}
      error={error}
      onChangeText={onChange}
      placeholder={kind === "date" ? "YYYY-MM-DD" : "HH:MM"}
      autoCorrect={false}
      autoCapitalize="none"
      keyboardType="numbers-and-punctuation"
      maxLength={kind === "date" ? 10 : 5}
    />
  );
}
