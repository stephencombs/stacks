import { EmptyState, PageTitle } from "../components/ui/Surface";
import { PersonalScreen } from "../features/Personal";

export function MapScreen() {
  return (
    <PersonalScreen live>
      <PageTitle>Map</PageTitle>
      <EmptyState title="Your map is on the way">
        The venues you've played, colored by how you did there, will show here.
      </EmptyState>
    </PersonalScreen>
  );
}
