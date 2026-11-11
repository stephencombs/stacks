import { createFileRoute } from "@tanstack/react-router";

import { PersonalFrame } from "~/features/Personal";
import { SettleUpList } from "~/features/SettleUp";

export const Route = createFileRoute("/you/settle/")({
  component: () => (
    <PersonalFrame>
      <SettleUpList />
    </PersonalFrame>
  ),
});
