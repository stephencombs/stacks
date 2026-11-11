export type FieldChoiceProps<A extends string> = {
  label: string;
  options: ReadonlyArray<{ readonly value: A; readonly label: string }>;
  value: A;
  onChange: (value: A) => void;
  labelHidden?: boolean;
  presentation?: "automatic" | "menu";
};

export function FieldChoice<A extends string>(_props: FieldChoiceProps<A>) {
  return null;
}
