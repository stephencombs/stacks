import { EmptyState, PageTitle } from "../components/ui/Surface";
import { PersonalScreen } from "../features/Personal";

export function StatsScreen() {
  return (
    <PersonalScreen live>
      <PageTitle>Stats</PageTitle>
      <EmptyState title="Your stats are on the way">
        Results, hours and win rate across your sessions, by time, game, venue and trip, will show
        here. Your sessions and their results are on Play.
      </EmptyState>
    </PersonalScreen>
  );
}
