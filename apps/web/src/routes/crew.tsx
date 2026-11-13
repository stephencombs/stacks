import { createFileRoute } from "@tanstack/react-router";

import { GroupsList } from "~/features/GroupsList";

export const Route = createFileRoute("/crew")({ component: GroupsList });
