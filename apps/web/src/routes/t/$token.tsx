import { createFileRoute } from "@tanstack/react-router";
import { fetchSharedTable } from "@stacks/client-runtime/api";
import { formatDay, formatTime } from "@stacks/client-runtime/format";
import { RECORDING_CURRENCY, visitTitle } from "@stacks/client-runtime/recordingView";
import type { MinorUnits } from "@stacks/contracts";
import type { TableView } from "@stacks/contracts/recordingCommands";
import { formatMoney } from "@stacks/shared/money";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { useEffect, useState } from "react";

import { Money } from "~/components/Money";
import { ButtonLink } from "~/components/ui/Button";
import { EmptyState, PageHeader, Section } from "~/components/ui/Page";
import { List, Row, RowText, Skeleton, Tag } from "~/components/ui/Surface";
import { PersonalFrame } from "~/features/Personal";

export const Route = createFileRoute("/t/$token")({ component: SharedTablePage });

const api = { baseUrl: import.meta.env.VITE_API_URL ?? "" };

/** A table someone shared: read-only, and it needs no account. */
function SharedTablePage() {
  const { token } = Route.useParams();
  const [view, setView] = useState<TableView | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void Effect.runPromiseExit(fetchSharedTable(api, token)).then((exit) => {
      if (current) setView(Exit.isSuccess(exit) ? exit.value : null);
    });
    return () => {
      current = false;
    };
  }, [token]);
  return (
    <PersonalFrame>
      {view === undefined ? (
        <>
          <PageHeader title="Shared table" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </>
      ) : view === null ? (
        <>
          <PageHeader title="Shared table" />
          <EmptyState title="This link doesn't work anymore">
            Whoever shared it may have stopped sharing or made a new link. Ask them for the current
            one.
          </EmptyState>
          <ButtonLink to="/" className="self-start">
            Open Color Up
          </ButtonLink>
        </>
      ) : (
        <SharedTable view={view} />
      )}
    </PersonalFrame>
  );
}

function SharedTable({ view }: { view: TableView }) {
  const names = new Map(view.players.map((player) => [player.id, player.displayName]));
  const visits = view.visits;
  const first = visits[0]?.visit;
  const live = visits.some((item) => item.finalResult === null);
  return (
    <>
      <PageHeader
        title={visitTitle(view.table)}
        tag={<Tag tone={live ? "live" : "neutral"}>{live ? "Live" : "Finished"}</Tag>}
        context={
          first
            ? `Started ${formatDay(first.startedAt)}, ${formatTime(first.startedAt)}`
            : undefined
        }
      />
      <Section title="Players" aside="Read-only">
        <List as="ul" label="Players at this table">
          {visits.map((item) => (
            <li key={item.visit.id}>
              <Row>
                <RowText
                  title={names.get(item.visit.playerId) ?? "Player"}
                  meta={
                    item.finalResult === null
                      ? `Playing · in ${formatMoneyText(item.totals.buyIn)}, out ${formatMoneyText(item.totals.cashOut)}`
                      : `Finished ${formatTime(item.visit.finishedAt!)}`
                  }
                />
                {item.finalResult === null ? (
                  <Tag tone="live">Live</Tag>
                ) : (
                  <Money amount={item.finalResult} currency={RECORDING_CURRENCY} tone="result" />
                )}
              </Row>
            </li>
          ))}
        </List>
      </Section>
      <ButtonLink to="/" className="self-start">
        Record your own play
      </ButtonLink>
    </>
  );
}

const formatMoneyText = (amount: MinorUnits) => formatMoney(amount, RECORDING_CURRENCY);
