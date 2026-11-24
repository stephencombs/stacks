import type { SessionCardModel } from "@stacks/client-runtime/shareCard";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Money } from "../components/Money";
import { Text } from "../components/ui/Text";
import { CardFrame } from "./ShareCardFrame";

/** A finished session as an image. Draws only what the model holds, so a hidden card has no money. */
export function SessionCard({ model }: { model: SessionCardModel }) {
  const { amounts, currency } = model;

  return (
    <CardFrame>
      <View className="gap-1">
        <Text numberOfLines={2} className="type-headline text-felt-ink">
          {model.venue ?? "Session"}
        </Text>
        <Text className="type-heading text-felt-soft">{model.game}</Text>
      </View>
      {amounts ? (
        <View className="gap-1">
          <Text className="type-label text-felt-soft">Your result</Text>
          <Money
            amount={amounts.result}
            currency={currency}
            tone="result"
            felt
            hidden={false}
            fit
            className="type-hero"
          />
        </View>
      ) : null}
      <View className="gap-4">
        {amounts ? (
          <View className="flex-row gap-4 border-t border-felt-ink/15 pt-4">
            <Detail label="Bought in">
              <Money
                amount={amounts.buyIn}
                currency={currency}
                felt
                hidden={false}
                className="type-number"
              />
            </Detail>
            <Detail label="Cashed out">
              <Money
                amount={amounts.cashOut}
                currency={currency}
                felt
                hidden={false}
                className="type-number"
              />
            </Detail>
            <Detail label="Hourly">
              {amounts.hourly === null ? (
                <Text className="type-number text-felt-soft">–</Text>
              ) : (
                <Text className="type-number text-felt-soft">
                  <Money
                    amount={amounts.hourly}
                    currency={currency}
                    tone="result"
                    felt
                    hidden={false}
                    className="type-number"
                  />
                  /hr
                </Text>
              )}
            </Detail>
          </View>
        ) : null}
        <View className="flex-row gap-4 border-t border-felt-ink/15 pt-4">
          <Detail label="Date">
            <Text className="type-number text-felt-ink">{model.date}</Text>
          </Detail>
          <Detail label="Duration">
            <Text className="type-number text-felt-ink">{model.duration}</Text>
          </Detail>
        </View>
      </View>
    </CardFrame>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-1 gap-0.5">
      <Text className="type-label text-felt-soft">{label}</Text>
      {children}
    </View>
  );
}
