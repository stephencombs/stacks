import { sampleTrip } from "@stacks/client-runtime/sample";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark } from "../components/BrandMark";
import { SignInButton } from "./SignInButton";
import { TripHero } from "./TripHero";

const steps = [
  {
    title: "Log it at the table",
    body: "Buy-ins and cash-outs take a few taps. A rebuy repeats your last amount in one.",
  },
  {
    title: "Watch the board",
    body: "Everyone's running total, session by session, with your line in gold.",
  },
  {
    title: "Settle up once",
    body: "The fewest payments that square everyone. Color Up never moves money.",
  },
];

/** What a signed-out visitor sees: the pitch, the app itself, and how a trip goes. */
export function Landing() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        contentContainerClassName="gap-10 px-6 pb-8"
        contentContainerStyle={{ paddingTop: insets.top + 16 }}
      >
        <View className="flex-row items-center gap-2">
          <BrandMark size={28} />
          <Text className="font-display text-2xl tracking-wide text-ink uppercase">Color Up</Text>
        </View>
        <View className="gap-4">
          <Text
            accessibilityRole="header"
            className="font-display text-6xl leading-[56px] text-ink uppercase"
          >
            Keep the casino trip honest.
          </Text>
          <Text className="text-lg text-muted">
            Log buy-ins and cash-outs as you play. Color Up works out everyone's results and who
            owes whom. You pay each other however you like.
          </Text>
        </View>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel="An example trip card: up $275 after three sessions and two nights, first on the board."
          pointerEvents="none"
        >
          <TripHero {...sampleTrip} />
        </View>
        <View className="gap-5">
          {steps.map((step, i) => (
            <View key={step.title} className="flex-row gap-4">
              <Text className="w-6 font-display text-3xl text-muted">{i + 1}</Text>
              <View className="flex-1 gap-1">
                <Text className="text-base font-medium text-ink">{step.title}</Text>
                <Text className="text-base text-muted">{step.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <View
        className="gap-3 border-t border-line bg-canvas px-6 pt-4"
        style={{ paddingBottom: insets.bottom + 16 }}
      >
        <SignInButton mode="sign-up" label="Create an account" variant="primary" />
        <SignInButton mode="sign-in" label="Sign in" variant="secondary" />
      </View>
    </View>
  );
}
