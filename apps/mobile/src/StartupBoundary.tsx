import { reportStartupError } from "./lib/diagnostics";
import { reloadAppAsync } from "expo";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

// Recovery must render without the app's fonts, theme hooks, or safe-area provider. Palette classes
// need none of them, and a system colour here can come out white on white.
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
    return (
      <View className="flex-1 justify-center gap-4 bg-canvas p-6">
        <Text accessibilityRole="header" className="text-2xl font-semibold text-ink">
          Color Up couldn't start
        </Text>
        <Text className="text-[17px] text-muted">
          Please try again. You can include error details when reporting the problem.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: this.state.showDetails }}
          onPress={() => this.setState(({ showDetails }) => ({ showDetails: !showDetails }))}
          className="min-h-11 justify-center"
        >
          <Text className="text-[17px] font-semibold text-ink">
            {this.state.showDetails ? "Hide details" : "Details"}
          </Text>
        </Pressable>
        {this.state.showDetails ? (
          <ScrollView className="shrink rounded-xl bg-surface p-3">
            <Text selectable className="text-[15px] text-ink">
              {this.state.message}
            </Text>
          </ScrollView>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => void reloadAppAsync()}
          className="min-h-12 items-center justify-center rounded-full bg-ink px-5"
        >
          <Text className="text-[17px] font-semibold text-ink-inverse">Try again</Text>
        </Pressable>
      </View>
    );
  }
}
