import { useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";

import { Stacks } from "~/api";

const healthAtom = Stacks.query("health", "health", {});

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const health = useAtomValue(healthAtom);
  const status = AsyncResult.match(health, {
    onInitial: () => "Checking API…",
    onFailure: () => "API unreachable",
    onSuccess: () => "API connected",
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-4">
      <h1 className="text-3xl font-semibold">Stacks</h1>
      <p className="text-muted">Casino sessions and who owes whom, for your group.</p>
      <p className="text-sm text-muted" aria-live="polite">
        {status}
      </p>
    </main>
  );
}
