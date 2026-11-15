import { EmptyState } from "../components/ui/Surface";
import { PersonalScreen } from "../features/Personal";

export function MapScreen() {
  return (
    <PersonalScreen live>
      <EmptyState title="Your map is on the way">
        The venues you've played, colored by how you did there, will show here.
      </EmptyState>
    </PersonalScreen>
  );
}
