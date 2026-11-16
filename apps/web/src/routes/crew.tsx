import { createFileRoute } from "@tanstack/react-router";

import { Crew } from "~/features/Crew";

export const Route = createFileRoute("/crew")({ component: Crew });
