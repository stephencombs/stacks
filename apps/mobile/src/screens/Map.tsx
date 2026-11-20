import { Platform, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { EmptyState } from "../components/ui/Surface";
import { PersonalScreen } from "../features/Personal";

export function MapScreen() {
  const android = Platform.OS === "android";
  const muted = String(useCSSVariable("--color-muted"));
  return (
    <PersonalScreen live contentClassName={android ? "gap-0 pt-0" : undefined}>
      {android ? (
        <View className="items-center gap-3 px-6 pt-[76px]">
          {/* Material Symbols map, Apache License 2.0. The selected Map tab uses this glyph too. */}
          <Svg width={32} height={32} viewBox="0 0 960 960" accessibilityElementsHidden>
            <Path
              fill={muted}
              d="M600,840L360,756L174,828Q154,836 137,823.5Q120,811 120,790L120,230Q120,217 127.5,207Q135,197 148,192L360,120L600,204L786,132Q806,124 823,136.5Q840,149 840,170L840,730Q840,743 832.5,753Q825,763 812,768L600,840ZM560,742L560,274L400,218L400,686L560,742Z"
            />
          </Svg>
          <Text accessibilityRole="header" className="self-stretch text-center type-title text-ink">
            Your map is on the way
          </Text>
          <Text className="max-w-xs text-center type-callout text-muted">
            The casinos you've played, colored by how you did there.
          </Text>
        </View>
      ) : (
        <EmptyState title="Your map is on the way">
          The venues you've played, colored by how you did there, will show here.
        </EmptyState>
      )}
    </PersonalScreen>
  );
}
