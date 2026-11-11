import { FieldGroup, Host, ListItem, Text } from "@expo/ui";
import {
  disabled,
  frame,
  listRowBackground,
  listRowSeparator,
  scrollContentBackground,
} from "@expo/ui/swift-ui/modifiers";
import { use, useState } from "react";
import { HStack, Image, Spacer } from "@expo/ui/swift-ui";
import { View } from "react-native";
import { useCSSVariable, useUniwind } from "uniwind";

import { LiveBar } from "../../features/LiveBar";
import { useNativeHeaderActions } from "../../features/NativeHeaderActions";
import { TabBarHeight } from "./Screen";
import type { SettingsLayoutProps } from "./SettingsLayout";

export function SettingsLayout({ groupName, currency, sections, children }: SettingsLayoutProps) {
  const header = useNativeHeaderActions();
  const { theme } = useUniwind();
  const [canvas, surface, ink, muted, danger, accent] = useCSSVariable([
    "--color-canvas",
    "--color-surface",
    "--color-ink",
    "--color-muted",
    "--color-danger",
    "--color-accent-text",
  ]).map(String);
  const bar = use(TabBarHeight);
  const [liveBarHeight, setLiveBarHeight] = useState(0);

  return (
    <View className="flex-1 bg-canvas">
      {header}
      <Host
        style={{ flex: 1, paddingBottom: bar }}
        colorScheme={theme === "dark" ? "dark" : "light"}
        seedColor={accent}
      >
        <FieldGroup modifiers={[scrollContentBackground("hidden")]}>
          <FieldGroup.Section title={groupName}>
            <HStack modifiers={[listRowBackground(String(surface)), frame({ minHeight: 44 })]}>
              <Text textStyle={{ color: ink }}>Ledger currency</Text>
              <Spacer />
              <Text textStyle={{ color: muted }}>{currency}</Text>
            </HStack>
          </FieldGroup.Section>
          {sections.map((section, index) => (
            <FieldGroup.Section key={section.title ?? index} title={section.title}>
              {section.rows.map((row) => (
                <ListItem
                  key={row.label}
                  onPress={row.onPress}
                  modifiers={[listRowBackground(String(surface)), disabled(row.pending ?? false)]}
                  trailing={
                    row.value || row.disclosure ? (
                      <HStack spacing={8}>
                        {row.value ? <Text textStyle={{ color: muted }}>{row.value}</Text> : null}
                        {row.disclosure ? (
                          <Image systemName="chevron.right" size={12} color={muted} />
                        ) : null}
                      </HStack>
                    ) : undefined
                  }
                >
                  <Text textStyle={{ color: row.destructive ? danger : ink }}>
                    {row.pending ? "Exporting…" : row.label}
                  </Text>
                </ListItem>
              ))}
              {section.footer || section.error ? (
                <FieldGroup.SectionFooter>
                  <Text textStyle={{ color: section.error ? danger : muted }}>
                    {section.error ?? section.footer}
                  </Text>
                </FieldGroup.SectionFooter>
              ) : null}
            </FieldGroup.Section>
          ))}
          {liveBarHeight > 0 ? (
            <Spacer
              modifiers={[
                frame({ height: liveBarHeight + 8 }),
                listRowBackground(String(canvas)),
                listRowSeparator("hidden"),
              ]}
            />
          ) : null}
        </FieldGroup>
      </Host>
      <LiveBar bottom={bar} onHeightChange={setLiveBarHeight} />
      {children}
    </View>
  );
}
