import { reportStartupError } from "./lib/diagnostics";
import { reloadAppAsync } from "expo";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Platform, PlatformColor, Pressable, ScrollView, Text, View } from "react-native";

// Recovery must render without the app's fonts, theme hooks, or safe-area provider.
export class StartupBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; message: string; showDetails: boolean }
> {
  override state = { failed: false, message: "", showDetails: false };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    const details = `${error instanceof Error ? (error.stack ?? error.message) : String(error)}${info.componentStack ? `\nComponent stack:\n${info.componentStack}` : ""}`;
    const report = new Error(error instanceof Error ? error.message : String(error));
    report.name = error instanceof Error ? error.name : "Error";
    report.stack = details;
    reportStartupError(report);
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
        <Text style={{ color, fontSize: 17 }}>
          Please try again. You can include error details when reporting the problem.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: this.state.showDetails }}
          onPress={() => this.setState(({ showDetails }) => ({ showDetails: !showDetails }))}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ color, fontSize: 17 }}>
            {this.state.showDetails ? "Hide details" : "Details"}
          </Text>
        </Pressable>
        {this.state.showDetails ? (
          <ScrollView style={{ flexShrink: 1 }}>
            <Text selectable style={{ color, fontSize: 15 }}>
              {this.state.message}
            </Text>
          </ScrollView>
        ) : null}
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
