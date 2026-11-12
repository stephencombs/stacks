import { Text } from "react-native";

export type HeaderTitleProps = {
  title: string;
  context?: string;
  onExpand?: () => void;
};

export function HeaderTitle({ title }: HeaderTitleProps) {
  return <Text className="type-body font-semibold text-ink">{title}</Text>;
}
