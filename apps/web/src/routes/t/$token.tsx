import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { fetchSharedTable } from "@stacks/client-runtime/api";
import { formatDay, formatTime } from "@stacks/client-runtime/format";
import { useJoinTable, useRecordingTable } from "@stacks/client-runtime/recordingReact";
import { RECORDING_CURRENCY, visitTitle } from "@stacks/client-runtime/recordingView";
import type { MinorUnits } from "@stacks/contracts";
import type { TableView } from "@stacks/contracts/recordingCommands";
import { formatMoney } from "@stacks/shared/money";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { useEffect, useState } from "react";

import { Money } from "~/components/Money";
import { Button, ButtonLink } from "~/components/ui/Button";
import { EmptyState, Note, PageHeader, Section } from "~/components/ui/Page";
import { List, Row, RowText, Skeleton, Tag } from "~/components/ui/Surface";
import { focusMain, PersonalFrame } from "~/features/Personal";
import { JoinDialog, SitDownDialog } from "~/features/RecordingForms";

export const Route = createFileRoute("/t/$token")({ component: SharedTablePage });

const api = { baseUrl: import.meta.env.VITE_API_URL ?? "" };

/** A table someone shared: anyone can watch it, and join it to record their own play. */
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
            one. If you already joined this table, your sessions there are in your play.
          </EmptyState>
          <ButtonLink to="/" className="self-start">
            Open Color Up
          </ButtonLink>
        </>
      ) : (
        <SharedTable view={view} token={token} />
      )}
    </PersonalFrame>
  );
}

function SharedTable({ view, token }: { view: TableView; token: string }) {
  const local = useRecordingTable(view.table.id);
  const join = useJoinTable(token);
  const navigate = useNavigate();
  const [open, setOpen] = useState<"join" | "sit" | null>(null);
  const names = new Map(view.players.map((player) => [player.id, player.displayName]));
  const you = local?.you.player ?? null;
  const visits = view.visits;
  const first = visits[0]?.visit;
  const live = visits.some((item) => item.finalResult === null);
  const seated = (visitId: string) =>
    void navigate({ to: "/play/$visitId", params: { visitId } }).then(focusMain);
  const played = local?.visits.some((item) => item.isSelf) ?? false;
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
      <Section title="Players" aside={local ? undefined : "Read-only"}>
        {visits.length === 0 ? (
          <Note>Nobody has bought in yet.</Note>
        ) : (
          <List as="ul" label="Players at this table">
            {visits.map((item) => (
              <li key={item.visit.id}>
                <Row>
                  <RowText
                    title={
                      item.visit.playerId === you?.id
                        ? "You"
                        : (names.get(item.visit.playerId) ?? "Player")
                    }
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
        )}
      </Section>
      {local?.role === "starter" ? (
        <>
          <Note>You started this table. Record for everyone from your session.</Note>
          {local.you.playing ? (
            <ButtonLink
              to="/play/$visitId"
              params={{ visitId: local.you.playing }}
              className="self-start"
            >
              Open your session
            </ButtonLink>
          ) : null}
        </>
      ) : local ? (
        <div className="flex flex-wrap gap-2">
          {local.you.playing ? (
            <ButtonLink
              variant="primary"
              to="/play/$visitId"
              params={{ visitId: local.you.playing }}
            >
              Open your session
            </ButtonLink>
          ) : (
            <Button variant="primary" onClick={() => setOpen("sit")}>
              {played ? "Back at the table" : "Buy in"}
            </Button>
          )}
        </div>
      ) : (
        <>
          <Note>
            Playing here? Join to record your own buy-ins and cash-outs. You don't need an account.
          </Note>
          <Button variant="primary" className="self-start" onClick={() => setOpen("join")}>
            Join this table
          </Button>
        </>
      )}
      {open === "join" ? (
        <JoinDialog join={join} onClose={() => setOpen(null)} onJoined={() => setOpen("sit")} />
      ) : open === "sit" && local && you ? (
        <SitDownDialog
          tableId={view.table.id}
          player={you}
          returning={played}
          onClose={() => setOpen(null)}
          onSeated={seated}
        />
      ) : null}
    </>
  );
}

const formatMoneyText = (amount: MinorUnits) => formatMoney(amount, RECORDING_CURRENCY);
