import { twMerge } from "tailwind-merge";

export const cn = (...classes: ReadonlyArray<string | false | null | undefined>) =>
  twMerge(classes.filter(Boolean).join(" "));
