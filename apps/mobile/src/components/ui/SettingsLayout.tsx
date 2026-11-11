import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { Icon } from "./Icon";
import { Screen } from "./Screen";
import { List, Row, SectionHeading } from "./Surface";

export type SettingsLayoutProps = {
  groupName: string;
  currency: string;
  sections: ReadonlyArray<{
    title?: string;
    footer?: string;
    error?: string | null;
    rows: ReadonlyArray<{
      label: string;
      value?: string;
      destructive?: boolean;
      disclosure?: boolean;
      pending?: boolean;
      onPress: () => void;
    }>;
  }>;
  children?: ReactNode;
};

export function SettingsLayout({ groupName, currency, sections, children }: SettingsLayoutProps) {
  return (
    <Screen>
      <View className="gap-1">
        <Text className="type-title text-ink">{groupName}</Text>
        <Text className="type-footnote text-muted">{currency} ledger</Text>
      </View>
      {sections.map((section, index) => (
        <View key={section.title ?? index} className="gap-2">
          {section.title ? <SectionHeading>{section.title}</SectionHeading> : null}
          <List>
            {section.rows.map((row) => (
              <Row
                key={row.label}
                onPress={row.pending ? undefined : row.onPress}
                accessibilityHint={row.pending ? "Exporting ledger" : undefined}
              >
                <Text
                  className={`flex-1 type-body ${row.destructive ? "text-danger" : "text-ink"}`}
                >
                  {row.pending ? "Exporting…" : row.label}
                </Text>
                {row.value ? (
                  <Text className="shrink type-callout text-muted">{row.value}</Text>
                ) : null}
                {row.disclosure ? <Icon name="chevron-right" color="faint" size={18} /> : null}
              </Row>
            ))}
          </List>
          {section.footer ? (
            <Text className="px-1 type-footnote text-muted">{section.footer}</Text>
          ) : null}
          {section.error ? (
            <Text accessibilityRole="alert" className="px-1 type-footnote text-danger">
              {section.error}
            </Text>
          ) : null}
        </View>
      ))}
      {children}
    </Screen>
  );
}
