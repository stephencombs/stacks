import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import * as Predicate from "effect/Predicate";
import { useLayoutEffect, useRef } from "react";

/**
 * Sets the screen's navigation options, and sets them again only when their shape changes. A
 * function option counts by its presence, never its identity, so a fresh closure on every render
 * can't churn the native bar. Bump `optionsVersion` when what a function returns changes.
 */
export function ScreenOptions({
  options,
  optionsVersion,
}: {
  options: NativeStackNavigationOptions;
  optionsVersion?: string | number;
}) {
  const navigation = useNavigation();
  const applied = useRef<string | null>(null);

  const signature = JSON.stringify([
    optionsVersion,
    Object.entries(options).map(([key, option]) => [
      key,
      Predicate.isFunction(option) ? "fn" : option,
    ]),
  ]);

  useLayoutEffect(() => {
    if (applied.current === signature) return;
    applied.current = signature;
    navigation.setOptions(options);
  }, [navigation, options, signature]);

  return null;
}
