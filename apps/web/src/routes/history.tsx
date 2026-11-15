import { createFileRoute } from "@tanstack/react-router";
import { formatDay, formatTime } from "@stacks/client-runtime/format";
import { useRecordingHome, useRecordingSubmit } from "@stacks/client-runtime/recordingReact";
import {
  recordingMonths,
  RECORDING_CURRENCY,
  visitTitle,
} from "@stacks/client-runtime/recordingView";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { FormError } from "~/components/ui/Field";
import { BackLink } from "~/components/ui/Nav";
import { EmptyState, PageHeader, Section } from "~/components/ui/Page";
import { List, Row, RowLink, RowText, Skeleton } from "~/components/ui/Surface";
import { SaveStatus } from "~/features/Personal";

export const Route = createFileRoute("/history")({ component: History });

function History() {
  const { home, status, error, retryLoad } = useRecordingHome();
  const restore = useRecordingSubmit();
  const months = home ? recordingMonths(home) : [];
  return (
    <>
      <PageHeader title="All sessions" back={<BackLink to="/">Your play</BackLink>}>
        <SaveStatus status={status} error={error} onRetry={retryLoad} />
      </PageHeader>
      {restore.error ? <FormError>{restore.error}</FormError> : null}
      {home === null ? (
        status === "load_failed" ? null : (
          <Skeleton className="h-40 w-full rounded-xl" />
        )
      ) : months.length === 0 ? (
        <EmptyState title="No sessions yet">
          Your sessions will appear here, including ones you delete.
        </EmptyState>
      ) : (
        months.map(({ month, result, count, visits }) => (
          <Section
            key={month}
            title={new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
              new Date(`${month}-02T12:00:00`),
            )}
            aside={
              <span>
                {count} {count === 1 ? "session" : "sessions"} ·{" "}
                <Money amount={result} currency={RECORDING_CURRENCY} tone="result" />
              </span>
            }
          >
            <List>
              {visits.map((item) =>
                item.visit.deletedAt !== undefined ? (
                  <Row key={item.visit.id}>
                    <RowText
                      title={
                        <span className="text-muted line-through">
                          {formatDay(item.visit.startedAt)} · {visitTitle(item.table)}
                        </span>
                      }
                      meta={`${item.venue?.name ? `${item.venue.name} · ` : ""}Deleted`}
                    />
                    <Button
                      variant="ghost"
                      pending={restore.pending}
                      onClick={() =>
                        void restore.submit({ type: "restore_visit", visitId: item.visit.id })
                      }
                      aria-label={`Restore ${visitTitle(item.table)} from ${formatDay(item.visit.startedAt)}`}
                    >
                      Restore
                    </Button>
                  </Row>
                ) : (
                  <RowLink
                    key={item.visit.id}
                    to="/play/$visitId"
                    params={{ visitId: item.visit.id }}
                  >
                    <RowText
                      title={`${formatDay(item.visit.startedAt)} · ${visitTitle(item.table)}`}
                      meta={`${item.venue?.name ? `${item.venue.name} · ` : ""}${formatTime(item.visit.startedAt)}`}
                    />
                    {item.finalResult === null ? (
                      <span className="text-sm text-muted">Live</span>
                    ) : (
                      <Money
                        amount={item.finalResult}
                        currency={RECORDING_CURRENCY}
                        tone="result"
                      />
                    )}
                  </RowLink>
                ),
              )}
            </List>
          </Section>
        ))
      )}
    </>
  );
}
