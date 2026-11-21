import * as Compose from "@expo/ui/jetpack-compose";
import {
  DropdownMenuItem,
  ExposedDropdownMenu,
  ExposedDropdownMenuBox,
  Icon,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
  TextField,
  useNativeState,
} from "@expo/ui/jetpack-compose";
import {
  defaultMinSize,
  fillMaxWidth,
  menuAnchor,
  semantics,
} from "@expo/ui/jetpack-compose/modifiers";
import { useEffect, useState } from "react";
import { Text as NativeText, View, useWindowDimensions } from "react-native";

import { ComposeHost as Host } from "./ComposeHost.android";
import type { FieldChoiceProps } from "./FieldChoice";
import { fitsSegments } from "./segmentFit";

const arrow = require("../../../assets/field-icons/arrow_drop_down.xml");

const fieldOutline = Compose.Shape.RoundedCorner({
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

  const segmented =
    presentation !== "menu" &&
    fitsSegments(
      options.map((option) => option.label),
      width - 64,
      fontScale,
    );

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
          <Dropdown label={label} options={options} value={value} onChange={onChange} />
        )}
      </Host>
    </View>
  );
}

function Dropdown<A extends string>({
  label,
  options,
  value,
  onChange,
}: Pick<FieldChoiceProps<A>, "label" | "options" | "value" | "onChange">) {
  const [expanded, setExpanded] = useState(false);
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
        {...{ ["shape"]: fieldOutline }}
        modifiers={[
          fillMaxWidth(),
          menuAnchor("primaryNotEditable"),
          semantics({ contentDescription: `${label}, ${shown}` }),
        ]}
        colors={{ focusedIndicatorColor: "transparent", unfocusedIndicatorColor: "transparent" }}
      >
        <TextField.TrailingIcon>
          <Icon source={arrow} size={24} />
        </TextField.TrailingIcon>
      </TextField>
      <ExposedDropdownMenu expanded={expanded} onDismissRequest={() => setExpanded(false)}>
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
