/** Color Up follows the system by default; light and dark are saved choices. */
export type ThemeChoice = "system" | "light" | "dark";

export const themeChoices = [
  { value: "system", label: "Match system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies ReadonlyArray<{ value: ThemeChoice; label: string }>;
