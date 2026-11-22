import type { ReactNode } from "react";
import { Pressable, TextInput, View } from "react-native";

import { FormError } from "./Field";
import { Icon } from "./Icon";
import { PickerRowsSkeleton } from "./PickerRowsSkeleton";
import { Sheet } from "./Sheet";

export type SearchablePickerSheetProps = {
  open: boolean;
  title: string;
  placeholder: string;
  query: string;
  onQueryChange: (next: string) => void;
  /** Shows the row skeleton in place of `children`. */
  loading?: boolean;
  /** While a choice is being saved, nothing dismisses the sheet. */
  busy?: boolean;
  error?: string | null | undefined;
  onClose: () => void;
  children: ReactNode;
};

function BottomSearchBar({
  value,
  placeholder,
  onChangeText,
}: {
  value: string;
  placeholder: string;
  onChangeText: (next: string) => void;
}) {
  return (
    <View className="h-14 flex-row items-center gap-3 rounded-full bg-fill pr-2 pl-4">
      <Icon name="search" color="muted" size={20} />
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColorClassName="accent-muted"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        className="min-h-0 flex-1 p-0 type-body text-ink"
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText("")}
          hitSlop={6}
          className="size-10 items-center justify-center"
        >
          <Icon name="close" color="muted" size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A full-height sheet for choosing one row from a searchable list, with the search bar pinned
 * above the keyboard. Android draws a Material bottom search bar with a trailing clear button;
 * iOS uses the native one (`SearchablePickerSheet.ios.tsx`).
 */
export function SearchablePickerSheet({
  open,
  title,
  placeholder,
  query,
  onQueryChange,
  loading = false,
  busy = false,
  error,
  onClose,
  children,
}: SearchablePickerSheetProps) {
  return (
    <Sheet
      open={open}
      back
      large
      busy={busy}
      title={title}
      onClose={onClose}
      footer={
        <>
          {error ? <FormError>{error}</FormError> : null}
          <BottomSearchBar value={query} placeholder={placeholder} onChangeText={onQueryChange} />
        </>
      }
    >
      {loading ? <PickerRowsSkeleton /> : children}
    </Sheet>
  );
}
