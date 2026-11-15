import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { formatDay } from "@stacks/client-runtime/format";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import {
  RECORDING_CURRENCY,
  visitTitle,
  type RecordedVisit,
} from "@stacks/client-runtime/recordingView";
import type { VisitId } from "@stacks/contracts";
import { useState } from "react";

import { Money } from "~/components/Money";
import { ActionBar } from "~/components/ui/ActionBar";
import { Button, ButtonLink } from "~/components/ui/Button";
import { EmptyState, Section, TabTitle } from "~/components/ui/Page";
import { Glow, List, RowLink, RowText, Skeleton, Surface } from "~/components/ui/Surface";
import { LiveBar } from "~/features/LiveBar";
import { focusMain, SaveStatus, useDialogFocus } from "~/features/Personal";
import { PastSessionDialog, StartDialog } from "~/features/RecordingForms";

export const Route = createFileRoute("/")({ component: Home });

/** How many finished sessions show before "Show all". */
const RECENT = 10;

function Home() {
  const { home, status, error, retryLoad } = useRecordingHome();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"start" | "past" | null>(null);
  const focus = useDialogFocus();
  const close = () => {
    setDialog(null);
    focus.restore();
  };
  const [showAll, setShowAll] = useState(false);
  // Close first, so the dialog can't submit again while the route changes.
  const open = (visitId: VisitId) => {
    setDialog(null);
    void navigate({ to: "/play/$visitId", params: { visitId } }).then(focusMain);
  };
  const playing = (home?.active.length ?? 0) > 0;
  return (
    <div onClickCapture={focus.capture} className="contents">
      <TabTitle>Play</TabTitle>
      <div className="flex flex-col gap-3">
        <SaveStatus status={status} error={error} onRetry={retryLoad} />
      </div>
      {home === null ? (
        status === "load_failed" ? null : (
          <Skeleton className="h-32 w-full rounded-xl" />
        )
      ) : (
        <>
          {home.finished.length > 0 ? (
            <>
              <FinishedHero result={home.finishedResult} count={home.finished.length} />
              <Section title="Finished" aside={`${home.finished.length}`}>
                <List>
                  {(showAll ? home.finished : home.finished.slice(0, RECENT)).map((item) => (
                    <FinishedRow key={item.visit.id} item={item} />
                  ))}
                </List>
                {home.finished.length > RECENT && !showAll ? (
                  <Button variant="ghost" className="self-start" onClick={() => setShowAll(true)}>
                    Show all {home.finished.length}
                  </Button>
                ) : null}
              </Section>
            </>
          ) : null}
          {!playing && home.finished.length === 0 ? (
            <EmptyState title="No sessions yet">
              Start one with your first buy-in. It's saved on this device, and you don't need an
              account.
            </EmptyState>
          ) : null}
        </>
      )}
      <ButtonLink to="/history" variant="ghost" className="self-start">
        All sessions
      </ButtonLink>
      <ActionBar>
        <LiveBar inline />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant={playing ? "secondary" : "primary"}
            size="lg"
            disabled={home === null}
            onClick={() => setDialog("start")}
          >
            Start session
          </Button>
          <Button
            variant="ghost"
            size="lg"
            disabled={home === null}
            onClick={() => setDialog("past")}
          >
            Add past session
          </Button>
        </div>
      </ActionBar>
      {dialog === "start" ? <StartDialog onClose={close} onStarted={open} /> : null}
      {dialog === "past" ? <PastSessionDialog onClose={close} onAdded={open} /> : null}
    </div>
  );
}

function FinishedRow({ item }: { item: RecordedVisit }) {
  return (
    <RowLink to="/play/$visitId" params={{ visitId: item.visit.id }}>
      <RowText
        title={`${formatDay(item.visit.finishedAt!)} · ${visitTitle(item.table)}`}
        meta={
          <>
            {item.venue ? `${item.venue.name} · ` : null}In{" "}
            <Money amount={item.totals.buyIn} currency={RECORDING_CURRENCY} /> · Out{" "}
            <Money amount={item.totals.cashOut} currency={RECORDING_CURRENCY} />
          </>
        }
      />
      <span className="shrink-0 font-semibold">
        <Money amount={item.finalResult!} currency={RECORDING_CURRENCY} tone="result" />
      </span>
    </RowLink>
  );
}

function FinishedHero({ result, count }: { result: number; count: number }) {
  return (
    <Surface className="relative overflow-hidden p-4">
      <Glow tone={result > 0 ? "win" : result < 0 ? "loss" : "ink"} />
      <div className="relative flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">Finished results</p>
        <Money
          amount={result}
          currency={RECORDING_CURRENCY}
          tone="result"
          className="font-display text-5xl sm:text-6xl"
        />
        <p className="text-sm text-muted">
          {count === 1 ? "1 finished session" : `${count} finished sessions`}. Live play counts once
          you finish.
        </p>
      </div>
    </Surface>
  );
}
