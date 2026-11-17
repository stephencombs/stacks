import {
  DropdownMenuItem,
  ExposedDropdownMenu,
  ExposedDropdownMenuBox,
  Icon,
  SegmentedButton,
  Shape,
  SingleChoiceSegmentedButtonRow,
  Text,
  TextField,
  useNativeState,
} from "@expo/ui/jetpack-compose";
import { defaultMinSize, fillMaxWidth, menuAnchor } from "@expo/ui/jetpack-compose/modifiers";
import { useEffect, useState } from "react";
import { Text as NativeText, View, useWindowDimensions } from "react-native";
import { useCSSVariable } from "uniwind";

import { ComposeHost as Host } from "./ComposeHost.android";
import type { FieldChoiceProps } from "./FieldChoice";

const arrow = require("../../../assets/field-icons/arrow_drop_down.xml");
const fieldShape = Shape.RoundedCorner({
  cornerRadii: { topStart: 16, topEnd: 16, bottomStart: 16, bottomEnd: 16 },
});

export function FieldChoice<A extends string>({
  label,
  options,
  value,
  onChange,
  labelHidden = false,
  presentation = "automatic",
}: FieldChoiceProps<A>) {
  const { width, fontScale } = useWindowDimensions();
  const segmentWidth = (width - 64) / Math.max(1, options.length);
  const segmented =
    presentation !== "menu" &&
    options.length <= 3 &&
    options.every((option) => option.label.length * 8 * fontScale + 48 <= segmentWidth);
  return (
    <View className="gap-1.5">
      {labelHidden ? null : (
        <NativeText className="px-1 type-footnote font-medium text-muted">{label}</NativeText>
      )}
      <Host matchContents={{ vertical: true }}>
        {segmented ? (
          <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
            {options.map((option) => (
              <SegmentedButton
                key={option.value}
                selected={option.value === value}
                onClick={() => onChange(option.value)}
                modifiers={[defaultMinSize({ minHeight: 48 })]}
              >
                <SegmentedButton.Label>
                  <Text>{option.label}</Text>
                </SegmentedButton.Label>
              </SegmentedButton>
            ))}
          </SingleChoiceSegmentedButtonRow>
        ) : (
          <Dropdown options={options} value={value} onChange={onChange} />
        )}
      </Host>
    </View>
  );
}

/** Material's exposed dropdown: a full-width field with a trailing arrow that opens on one tap. */
function Dropdown<A extends string>({
  options,
  value,
  onChange,
}: Pick<FieldChoiceProps<A>, "options" | "value" | "onChange">) {
  const [expanded, setExpanded] = useState(false);
  const [ink, surface, muted] = useCSSVariable([
    "--color-ink",
    "--color-surface",
    "--color-muted",
  ]).map(String);
  const shown = options.find((option) => option.value === value)?.label ?? "";
  const text = useNativeState(shown);
  useEffect(() => {
    text.set(shown);
  }, [text, shown]);
  return (
    <ExposedDropdownMenuBox expanded={expanded} onExpandedChange={setExpanded}>
      <TextField
        value={text}
        readOnly
        singleLine
        shape={fieldShape}
        modifiers={[fillMaxWidth(), menuAnchor("primaryNotEditable")]}
        colors={{
          focusedContainerColor: surface,
          unfocusedContainerColor: surface,
          focusedTextColor: ink,
          unfocusedTextColor: ink,
          focusedIndicatorColor: "transparent",
          unfocusedIndicatorColor: "transparent",
          cursorColor: ink,
        }}
      >
        <TextField.TrailingIcon>
          <Icon source={arrow} tint={muted} size={24} />
        </TextField.TrailingIcon>
      </TextField>
      <ExposedDropdownMenu
        expanded={expanded}
        containerColor={surface}
        onDismissRequest={() => setExpanded(false)}
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => {
              setExpanded(false);
              onChange(option.value);
            }}
          >
            <DropdownMenuItem.Text>
              <Text>{option.label}</Text>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
        ))}
      </ExposedDropdownMenu>
    </ExposedDropdownMenuBox>
  );
}
