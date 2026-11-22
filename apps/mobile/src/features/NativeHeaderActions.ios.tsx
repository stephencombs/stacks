import { useNavigation } from "@react-navigation/native";
import type {
  NativeStackHeaderItem,
  NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import { useLayoutEffect, useState } from "react";

import { PressableScale } from "../components/ui/PressableScale";
import { useAccount } from "../lib/account";
import { PersonalYou } from "./Personal";
import { UserAvatar } from "./UserAvatar";
import { YouSheet } from "./You";

export function useNativeHeaderActions(personal = false, onOpenGroups?: () => void) {
  const navigation = useNavigation();
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const signedIn = account.available && !!account.isSignedIn;

  useLayoutEffect(() => {
    const youItem: NativeStackHeaderItem = signedIn
      ? {
          type: "custom",
          hidesSharedBackground: true,
          element: (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="You"
              accessibilityHint={
                personal ? "Your sessions, appearance and account" : "Your settings and account"
              }
              onPress={() => setOpen(true)}
              hitSlop={6}
              className="size-9 items-center justify-center"
            >
              <UserAvatar size={36} ring={false} />
            </PressableScale>
          ),
        }
      : {
          type: "button",
          label: "You",
          accessibilityLabel: "You",
          icon: { type: "sfSymbol", name: "person.crop.circle" },
          sharesBackground: false,
          onPress: () => setOpen(true),
        };

    navigation.setOptions({
      unstable_headerRightItems: () => [
        youItem,
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
  }, [navigation, onOpenGroups, personal, signedIn]);

  if (!open) return null;

  return personal ? (
    <PersonalYou onClose={() => setOpen(false)} />
  ) : (
    <YouSheet onClose={() => setOpen(false)} />
  );
}
