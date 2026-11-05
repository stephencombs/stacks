import { reloadAppAsync } from "expo";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Platform, PlatformColor, Pressable, ScrollView, Text, View } from "react-native";

// Recovery must render without the app's fonts, theme hooks, or safe-area provider.
export class StartupBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; message: string }
> {
  override state = { failed: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    const details = `${error instanceof Error ? (error.stack ?? error.message) : String(error)}${info.componentStack ? `\nComponent stack:\n${info.componentStack}` : ""}`;
    const report = new Error(error instanceof Error ? error.message : String(error));
    report.name = error instanceof Error ? error.name : "Error";
    report.stack = details;
    // Diagnostics pulls in native reporting. Keep that off this module so the
    // boundary can paint even when that import fails.
    void import("./lib/diagnostics").then(({ reportStartupError }) => reportStartupError(report));
    this.setState({ message: details });
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    const color =
      Platform.OS === "web"
        ? "CanvasText"
        : PlatformColor(Platform.OS === "ios" ? "labelColor" : "?android:attr/textColorPrimary");
    const backgroundColor =
      Platform.OS === "web"
        ? "Canvas"
        : PlatformColor(
            Platform.OS === "ios" ? "systemBackgroundColor" : "?android:attr/colorBackground",
          );
    return (
      <View style={{ flex: 1, justifyContent: "center", gap: 16, padding: 24, backgroundColor }}>
        <Text accessibilityRole="header" style={{ color, fontSize: 24, fontWeight: "600" }}>
          Color Up couldn't start
        </Text>
        <Text style={{ color, fontSize: 17 }}>Send this error with your report:</Text>
        <ScrollView style={{ flexShrink: 1 }}>
          <Text selectable style={{ color, fontSize: 15 }}>
            {this.state.message}
          </Text>
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          onPress={() => void reloadAppAsync()}
          style={{
            minHeight: 44,
            justifyContent: "center",
            paddingHorizontal: 16,
            borderWidth: 1,
            borderColor: color,
            borderRadius: 12,
          }}
        >
          <Text style={{ color, fontSize: 17, fontWeight: "600" }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
