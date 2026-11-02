import { expect, it, layer } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { CurrencyCode, MinorUnits } from "@stacks/contracts";

import { groupWith, ids, usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";
import { csvText } from "./Export.ts";

it("neutralizes spreadsheet formulas including leading whitespace", () => {
  expect(csvText("=1+1")).toBe("'=1+1");
  expect(csvText("  @SUM(A1)")).toBe("'  @SUM(A1)");
  expect(csvText("-10")).toBe("'-10");
  expect(csvText("ordinary text")).toBe("ordinary text");
});

/** RFC 4180 parser for verifying exported rows round-trip cleanly with embedded newlines and quotes. */
const parseCsv = (csv: string): ReadonlyArray<ReadonlyArray<string>> => {
  const rows: Array<Array<string>> = [];
  let row: Array<string> = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};

layer(TestApi.layer)("Export", (it) => {
  it.effect(
    "exports every entry including voids, replacements, settlements and RFC 4180 escaping for any member",
    () =>
      Effect.gen(function* () {
        const { owner, bea } = yield* users("owner", "bea");
        const groupId = ids.group();
        yield* owner.groups.create({
          payload: {
            id: groupId,
            name: "Vegas, Crew",
            currency: CurrencyCode.make("USD"),
            displayName: 'Alex "Ace"',
          },
        });
        const invite = yield* owner.invites.create({
          params: { groupId },
          payload: { id: ids.invite(), maxUses: null },
        });
        const detail = yield* bea.invites.accept({
          params: { code: invite.code },
          payload: { displayName: "Bea, Jr." },
        });
        const [alexPlayer, beaPlayer] = detail.players;

        const trip = yield* owner.trips.create({
          params: { groupId },
          payload: { id: ids.trip(), name: 'Fall "26", Vegas' },
        });
        const venue = yield* owner.venues.create({
          payload: {
            id: ids.venue(),
            name: 'Bellagio, "High" Room',
            kind: "casino",
            city: "Las Vegas",
            region: "NV",
            country: "US",
            groupId: null,
          },
        });
        const session = yield* owner.sessions.create({
          params: { tripId: trip.id },
          payload: {
            id: ids.session(),
            venueId: venue.id,
            game: "blackjack",
            startedAt: DateTime.makeUnsafe("2026-10-21T20:00:00Z"),
            playerIds: [alexPlayer!.id, beaPlayer!.id],
            notes: null,
          },
        });
        const sessionId = session.session.id;

        const firstBuyIn = yield* owner.ledger.addEntry({
          params: { sessionId },
          payload: {
            id: ids.entry(),
            kind: "buy_in",
            playerId: beaPlayer!.id,
            counterpartyId: alexPlayer!.id,
            amount: usd(10_050),
            occurredAt: DateTime.makeUnsafe("2026-10-21T20:05:00Z"),
            note: 'Fronted, "cash"\nline two',
            replacesEntryId: null,
          },
        });
        const correctedBuyIn = yield* owner.ledger.addEntry({
          params: { sessionId },
          payload: {
            id: ids.entry(),
            kind: "buy_in",
            playerId: beaPlayer!.id,
            counterpartyId: alexPlayer!.id,
            amount: usd(20_005),
            occurredAt: DateTime.makeUnsafe("2026-10-21T20:06:00Z"),
            note: null,
            replacesEntryId: firstBuyIn.id,
          },
        });
        const adjustment = yield* owner.ledger.addEntry({
          params: { sessionId },
          payload: {
            id: ids.entry(),
            kind: "adjustment",
            playerId: alexPlayer!.id,
            counterpartyId: null,
            amount: usd(-1_525),
            occurredAt: DateTime.makeUnsafe("2026-10-21T20:10:00Z"),
            note: "Tip",
            replacesEntryId: null,
          },
        });
        yield* owner.ledger.voidEntry({
          params: { entryId: adjustment.id },
          payload: { reason: 'Wrong "player", redo' },
        });
        const settlement = yield* bea.ledger.recordSettlement({
          params: { tripId: trip.id },
          payload: {
            id: ids.entry(),
            fromPlayerId: beaPlayer!.id,
            toPlayerId: alexPlayer!.id,
            amount: usd(5_000),
            occurredAt: DateTime.makeUnsafe("2026-10-21T22:00:00Z"),
            note: "Zelle",
          },
        });

        // Non-admin member exports freely.
        const csv = yield* bea.groups.exportCsv({ params: { groupId } });
        const [header, ...rows] = parseCsv(csv);

        expect(header).toEqual([
          "entry_id",
          "date",
          "trip",
          "session",
          "venue",
          "game",
          "kind",
          "player",
          "counterparty",
          "amount",
          "currency",
          "note",
          "voided",
          "voided_at",
          "void_reason",
          "replaces_entry_id",
        ]);
        expect(rows).toHaveLength(4);

        expect(rows[0]).toEqual([
          firstBuyIn.id,
          "2026-10-21T20:05:00.000Z",
          'Fall "26", Vegas',
          sessionId,
          'Bellagio, "High" Room',
          "blackjack",
          "buy_in",
          "Bea, Jr.",
          'Alex "Ace"',
          "100.50",
          "USD",
          'Fronted, "cash"\nline two',
          "true",
          expect.stringMatching(/^20\d\d-/),
          "Corrected",
          "",
        ]);
        expect(rows[1]).toEqual([
          correctedBuyIn.id,
          "2026-10-21T20:06:00.000Z",
          'Fall "26", Vegas',
          sessionId,
          'Bellagio, "High" Room',
          "blackjack",
          "buy_in",
          "Bea, Jr.",
          'Alex "Ace"',
          "200.05",
          "USD",
          "",
          "false",
          "",
          "",
          firstBuyIn.id,
        ]);
        expect(rows[2]).toEqual([
          adjustment.id,
          "2026-10-21T20:10:00.000Z",
          'Fall "26", Vegas',
          sessionId,
          'Bellagio, "High" Room',
          "blackjack",
          "adjustment",
          'Alex "Ace"',
          "",
          "-15.25",
          "USD",
          "Tip",
          "true",
          expect.stringMatching(/^20\d\d-/),
          'Wrong "player", redo',
          "",
        ]);
        expect(rows[3]).toEqual([
          settlement.id,
          "2026-10-21T22:00:00.000Z",
          'Fall "26", Vegas',
          "",
          "",
          "",
          "settlement",
          "Bea, Jr.",
          'Alex "Ace"',
          "50.00",
          "USD",
          "Zelle",
          "false",
          "",
          "",
          "",
        ]);
      }),
  );

  it.effect("formats zero-decimal currencies and enforces active membership", () =>
    Effect.gen(function* () {
      const { owner, bea, outsider } = yield* users("owner", "bea", "outsider");
      const jpyGroupId = ids.group();
      const jpyGroup = yield* owner.groups.create({
        payload: {
          id: jpyGroupId,
          name: "Tokyo Crew",
          currency: CurrencyCode.make("JPY"),
          displayName: "Owner",
        },
      });
      const trip = yield* owner.trips.create({
        params: { groupId: jpyGroupId },
        payload: { id: ids.trip(), name: "Tokyo" },
      });
      const venue = yield* owner.venues.create({
        payload: {
          id: ids.venue(),
          name: "Home",
          kind: "home",
          city: null,
          region: null,
          country: null,
          groupId: jpyGroupId,
        },
      });
      const session = yield* owner.sessions.create({
        params: { tripId: trip.id },
        payload: {
          id: ids.session(),
          venueId: venue.id,
          game: "poker_cash",
          playerIds: [jpyGroup.players[0]!.id],
          notes: null,
        },
      });
      yield* owner.ledger.addEntry({
        params: { sessionId: session.session.id },
        payload: {
          id: ids.entry(),
          kind: "buy_in",
          playerId: jpyGroup.players[0]!.id,
          counterpartyId: null,
          amount: MinorUnits.make(15_000),
          note: null,
          replacesEntryId: null,
        },
      });

      const [, row] = parseCsv(yield* owner.groups.exportCsv({ params: { groupId: jpyGroupId } }));
      expect(row![9]).toBe("15000");
      expect(row![10]).toBe("JPY");

      const forbidden = yield* Effect.flip(
        outsider.groups.exportCsv({ params: { groupId: jpyGroupId } }),
      );
      expect(forbidden._tag).toBe("Forbidden");

      const missing = yield* Effect.flip(
        owner.groups.exportCsv({ params: { groupId: ids.group() } }),
      );
      expect(missing._tag).toBe("NotFound");

      const shared = yield* groupWith(owner, bea);
      yield* bea.groups.leave({ params: { groupId: shared.group.id } });
      const afterLeave = yield* Effect.flip(
        bea.groups.exportCsv({ params: { groupId: shared.group.id } }),
      );
      expect(afterLeave._tag).toBe("Forbidden");
    }),
  );
});
