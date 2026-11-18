export type SegmentedControlProps<A extends string> = {
  label: string;
  options: ReadonlyArray<{ readonly value: A; readonly label: string }>;
  value: A;
  onChange: (value: A) => void;
};

export function SegmentedControl<A extends string>(_props: SegmentedControlProps<A>) {
  return null;
}
