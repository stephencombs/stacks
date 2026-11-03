import { CommonActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";

import { Screen } from "../components/ui/Screen";
import { PageTitle } from "../components/ui/Surface";
import { SettleUpSkeleton } from "../features/ScreenSkeletons";
import { SettleView } from "../features/SettleUp";
import { ScopeLoaded, useLinkedScope } from "../lib/scope";
import { TripLoaded } from "../lib/stacks";

type Props = StaticScreenProps<{ tripId?: string } | undefined>;

/** Who owes whom on the trip in scope: payments, balances, backing and history. */
export function SettleUpScreen({ route }: Props) {
  const navigation = useNavigation();
  useLinkedScope(route.params, () =>
    navigation.dispatch(CommonActions.setParams({ tripId: undefined })),
  );
  return (
    <Screen>
      <PageTitle>Settle up</PageTitle>
      <ScopeLoaded skeleton={<SettleUpSkeleton />}>
        {({ trip }) =>
          trip ? (
            <TripLoaded tripId={trip.id} skeleton={<SettleUpSkeleton />}>
              {(detail, group) => <SettleView detail={group} trip={detail} />}
            </TripLoaded>
          ) : null
        }
      </ScopeLoaded>
    </Screen>
  );
}
