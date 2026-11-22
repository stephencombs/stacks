import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useLayoutEffect, useState } from "react";
import { View } from "react-native";

import { ControlSurface } from "../components/ui/ControlSurface";
import { Icon } from "../components/ui/Icon";
import { PressableScale } from "../components/ui/PressableScale";
import { useAccount } from "../lib/account";
import { PersonalYou } from "./Personal";
import { UserAvatar } from "./UserAvatar";
import { YouSheet } from "./You";

export function useNativeHeaderActions(
  personal = false,
  onOpenGroups?: () => void,
  disabled = false,
) {
  const navigation = useNavigation();
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const signedIn = account.available && !!account.isSignedIn;

  useLayoutEffect(() => {
    if (disabled) return;

    navigation.setOptions({
      unstable_headerRightItems: undefined,
      headerRightBackgroundVisible: false,
      headerRight: () => (
        <View className="flex-row items-center gap-2">
          {onOpenGroups ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Groups"
              onPress={onOpenGroups}
              hitSlop={6}
              className="size-11 items-center justify-center"
            >
              <ControlSurface>
                <Icon name="group" color="ink" size={20} />
              </ControlSurface>
            </PressableScale>
          ) : null}
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="You"
            accessibilityHint={
              personal ? "Your sessions, appearance and account" : "Your settings and account"
            }
            onPress={() => setOpen(true)}
            hitSlop={6}
            className="size-11 items-center justify-center"
          >
            <ControlSurface>
              {signedIn ? (
                <UserAvatar size={32} ring={false} />
              ) : (
                <Icon name="person" color="ink" size={20} />
              )}
            </ControlSurface>
          </PressableScale>
        </View>
      ),
    } satisfies NativeStackNavigationOptions);
  }, [disabled, navigation, onOpenGroups, personal, signedIn]);

  if (disabled || !open) return null;

  return personal ? (
    <PersonalYou onClose={() => setOpen(false)} />
  ) : (
    <YouSheet onClose={() => setOpen(false)} />
  );
}
