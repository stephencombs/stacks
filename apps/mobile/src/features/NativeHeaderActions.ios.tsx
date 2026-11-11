import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useLayoutEffect, useState } from "react";

import { PersonalYou } from "./Personal";
import { YouSheet } from "./You";

export function useNativeHeaderActions(personal = false) {
  const navigation = useNavigation();
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      unstable_headerRightItems: () => [
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
  }, [navigation, personal]);

  if (!open) return null;
  return personal ? (
    <PersonalYou onClose={() => setOpen(false)} />
  ) : (
    <YouSheet onClose={() => setOpen(false)} />
  );
}
