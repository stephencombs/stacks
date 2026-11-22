import { View } from "react-native";

import { NativeSearchBar } from "../../../modules/native-search-bar/src";
import { FormError } from "./Field";
import { GlassSurface } from "./GlassSurface";
import { PickerRowsSkeleton } from "./PickerRowsSkeleton";
import { Sheet } from "./Sheet";
import type { SearchablePickerSheetProps } from "./SearchablePickerSheet";

/**
 * A full-height sheet for choosing one row from a searchable list. Its search bar is a native
 * `UISearchBar` floating above the keyboard, with the system's clear button once text is typed.
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
      floatingFooter
      busy={busy}
      title={title}
      onClose={onClose}
      footer={
        <View className="gap-2">
          {error ? <FormError>{error}</FormError> : null}
          <GlassSurface radius={22} className="h-11 overflow-hidden">
            <NativeSearchBar
              style={{ height: 44 }}
              text={query}
              placeholder={placeholder}
              onChangeText={(event) => onQueryChange(event.nativeEvent.text)}
            />
          </GlassSurface>
        </View>
      }
    >
      {loading ? <PickerRowsSkeleton /> : children}
    </Sheet>
  );
}
