/** Stacks is dark by default; light and following the system are saved choices. */
export type ThemeChoice = "dark" | "light" | "system";

export const themeChoices = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "Match system" },
] as const satisfies ReadonlyArray<{ value: ThemeChoice; label: string }>;
