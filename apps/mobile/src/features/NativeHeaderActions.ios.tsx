import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useLayoutEffect, useState } from "react";

import { PersonalYou } from "./Personal";
import { YouSheet } from "./You";

export function useNativeHeaderActions(personal = false, onOpenGroups?: () => void) {
  const navigation = useNavigation();
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      unstable_headerRightItems: () => [
        {
          type: "button",
          label: "You",
          accessibilityLabel: "You",
          icon: { type: "sfSymbol", name: "person.crop.circle" },
          sharesBackground: false,
          onPress: () => setOpen(true),
        },
        ...(onOpenGroups
          ? [
              {
                type: "button" as const,
                label: "Groups",
                accessibilityLabel: "Groups",
                icon: { type: "sfSymbol" as const, name: "person.2" as const },
                sharesBackground: false,
                onPress: onOpenGroups,
              },
            ]
          : []),
      ],
    } satisfies NativeStackNavigationOptions);
  }, [navigation, onOpenGroups]);

  if (!open) return null;

  return personal ? (
    <PersonalYou onClose={() => setOpen(false)} />
  ) : (
    <YouSheet onClose={() => setOpen(false)} />
  );
}
