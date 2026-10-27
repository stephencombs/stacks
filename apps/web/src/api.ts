import { makeStacksClient } from "@stacks/client-runtime/api";

export const Stacks = makeStacksClient(import.meta.env.VITE_API_URL ?? "");
