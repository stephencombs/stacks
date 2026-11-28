import { cardHidden, type CardModel } from "@stacks/client-runtime/shareCard";
import { useRef, useState, type ComponentRef } from "react";
import { useWindowDimensions, View } from "react-native";

import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";
import { Switch } from "../components/ui/Switch";
import { Text } from "../components/ui/Text";
import { usePreferences } from "../lib/preferences";
import { shareImage } from "../lib/share";
import { CardTilt } from "./CardTilt";
import { SessionCard } from "./SessionCard";
import { CARD_HEIGHT, CARD_WIDTH } from "./ShareCardFrame";
import { TripCard } from "./TripCard";

/**
 * The card at its real proportions, a switch that hides every amount, and Share. What you see is
 * what is captured: the preview is the mounted view, drawn from the same model.
 */
export function ShareCardSheet({
  title,
  card,
  onClose,
}: {
  /** Names the shared file's dialog, like the trip's name. */
  title: string;
  /** The card for a hidden or visible state; it never reads preferences itself. */
  card: (hidden: boolean) => CardModel;
  onClose: () => void;
}) {
  const { privacyMode } = usePreferences();
  const [hideAmounts, setHideAmounts] = useState(privacyMode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = useRef<ComponentRef<typeof View>>(null);
  const { width } = useWindowDimensions();
  const hidden = cardHidden(privacyMode, hideAmounts);
  const model = card(hidden);
  const scale = Math.min(1, (width - 48) / CARD_WIDTH);

  const share = async () => {
    setPending(true);
    setError(null);

    try {
      await shareImage(view, title);
    } catch {
      setError("Couldn't make the card. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open
      busy={pending}
      onClose={onClose}
      title="Share card"
      footer={
        <Button
          label="Share"
          variant="primary"
          size="lg"
          pending={pending}
          onPress={() => void share()}
        />
      }
    >
      <View className="items-center">
        <CardTilt>
          <View
            style={{ width: CARD_WIDTH * scale, height: CARD_HEIGHT * scale }}
            className="overflow-hidden rounded-[22px]"
          >
            <View style={{ transform: [{ scale }], transformOrigin: "top left" }}>
              <View ref={view} collapsable={false}>
                {model.kind === "trip" ? <TripCard model={model} /> : <SessionCard model={model} />}
              </View>
            </View>
          </View>
        </CardTilt>
      </View>
      <View className="min-h-11 flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="type-body text-ink">Hide amounts</Text>
          {privacyMode ? (
            <Text className="type-footnote text-muted">Privacy mode is on</Text>
          ) : null}
        </View>
        <Switch
          accessibilityLabel="Hide amounts"
          value={hidden}
          disabled={pending || privacyMode}
          onValueChange={setHideAmounts}
        />
      </View>
      {error ? <FormError>{error}</FormError> : null}
    </Sheet>
  );
}
