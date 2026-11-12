import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useCSSVariable } from "uniwind";

import type { FormAction } from "../components/ui/Sheet";

import { PersonalYou } from "./Personal";
import { YouSheet } from "./You";

export function useNativeHeaderActions(
  personal = false,
  confirm?: FormAction,
  onCancel?: () => void,
) {
  const navigation = useNavigation();
  const [open, setOpen] = useState(false);
  const confirmRef = useRef(confirm);
  const cancelRef = useRef(onCancel);
  const danger = String(useCSSVariable("--color-danger"));
  useLayoutEffect(() => {
    confirmRef.current = confirm;
    cancelRef.current = onCancel;
  });
  const submit = useCallback(() => confirmRef.current?.onPress(), []);
  const cancel = useCallback(() => cancelRef.current?.(), []);
  const label = confirm?.label;
  const pending = confirm?.pending;
  const disabled = confirm?.disabled;
  const destructive = confirm?.destructive;
  const cancellable = onCancel !== undefined;

  useLayoutEffect(() => {
    navigation.setOptions({
      unstable_headerLeftItems: cancellable
        ? () => [
            {
              type: "button",
              label: "Cancel",
              disabled: pending,
              onPress: cancel,
            },
          ]
        : undefined,
      unstable_headerRightItems: label
        ? () => [
            {
              type: "button",
              label: pending ? "Saving…" : label,
              accessibilityLabel: label,
              variant: Number.parseInt(String(Platform.Version), 10) >= 26 ? "prominent" : "done",
              disabled: pending || disabled,
              ...(destructive ? { tintColor: danger } : {}),
              onPress: submit,
            },
          ]
        : () => [
            ...(personal
              ? [
                  {
                    type: "button" as const,
                    label: "Groups",
                    icon: { type: "sfSymbol" as const, name: "person.2" as const },
                    sharesBackground: true,
                    onPress: () => navigation.navigate("Account", { screen: "Groups" }),
                  },
                ]
              : []),
            {
              type: "button",
              label: "You",
              accessibilityLabel: "You",
              icon: { type: "sfSymbol", name: "person.crop.circle" },
              sharesBackground: true,
              onPress: () => setOpen(true),
            },
          ],
    } satisfies NativeStackNavigationOptions);
  }, [
    navigation,
    personal,
    label,
    pending,
    disabled,
    destructive,
    danger,
    cancellable,
    cancel,
    submit,
  ]);

  if (!open) return null;
  return personal ? (
    <PersonalYou onClose={() => setOpen(false)} />
  ) : (
    <YouSheet onClose={() => setOpen(false)} />
  );
}
