import type { StaticScreenProps } from "@react-navigation/native";

import { Screen, screenError } from "../components/ui/Screen";
import { SettleUpSkeleton } from "../features/ScreenSkeletons";
import { SettleView } from "../features/SettleUp";
import { ScopeLoaded, usePlaceAddress } from "../lib/scope";
import { TripLoaded } from "../lib/stacks";

type Props = StaticScreenProps<{ tripId?: string } | undefined>;

/** Who owes whom on the trip in scope: payments, balances, backing and history. */
export function SettleUpScreen({ route }: Props) {
  usePlaceAddress(route.params, "tripId");
  return (
    <ScopeLoaded
      renderError={screenError}
      skeleton={
        <Screen>
          <SettleUpSkeleton />
        </Screen>
      }
    >
      {({ trip }) =>
        trip ? (
          <TripLoaded
            renderError={screenError}
            tripId={trip.id}
            skeleton={
              <Screen>
                <SettleUpSkeleton />
              </Screen>
            }
          >
            {(detail, group) => <SettleView detail={group} trip={detail} />}
          </TripLoaded>
        ) : null
      }
    </ScopeLoaded>
  );
}
