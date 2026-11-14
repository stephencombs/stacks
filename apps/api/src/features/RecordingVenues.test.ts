import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { RecordingCommand } from "@stacks/contracts/recordingCommands";

import { catalogVenue, groupWith, ids, usd } from "../testing/fixtures.ts";
import { account, at, device, edit, start } from "../testing/recording.ts";
import { TestApi } from "../testing/TestApi.ts";

it.layer(TestApi.layer, { timeout: "30 seconds" })("recording venues", (it) => {
  for (const type of ["start", "record_completed"] as const) {
    it.effect(`${type} refuses private and missing venues, even for a home venue's owner`, () =>
      Effect.gen(function* () {
        const owner = yield* account("owner");
        const group = yield* groupWith(owner.client);
        const venue = yield* catalogVenue(owner.client);
        const home = yield* owner.client.venues.create({
          payload: {
            id: ids.venue(),
            name: "Home game",
            kind: "home",
            city: null,
            region: null,
            country: null,
            groupId: group.group.id,
          },
        });
        for (const recorder of [owner, yield* device()]) {
          const opened =
            type === "start"
              ? start(recorder.identity)
              : {
                  ...start(recorder.identity),
                  type,
                  cashOutId: ids.entry(),
                  cashOut: usd(12000),
                  finishedAt: at(20),
                };
          for (const venueId of [home.id, ids.venue()]) {
            const { results } = yield* recorder.client.recording.push({
              payload: {
                identity: recorder.identity,
                commands: [RecordingCommand.make({ ...opened, venueId })],
              },
            });
            expect(results).toEqual([
              {
                operationId: opened.operationId,
                status: "rejected",
                reason: "invalid",
                message: "Choose a public venue or leave the venue empty.",
              },
            ]);
            expect((yield* recorder.client.recording.history()).tables).toEqual([]);
          }
          expect(
            yield* recorder.push(RecordingCommand.make({ ...opened, venueId: venue.id })),
          ).toEqual(["accepted"]);
          expect((yield* recorder.client.recording.history()).tables).toMatchObject([
            { id: opened.tableId, venueId: venue.id },
          ]);
        }
      }),
    );
  }

  it.effect(
    "refuses private and missing venues on edit, and can set and clear a public venue",
    () =>
      Effect.gen(function* () {
        const owner = yield* account("owner");
        const group = yield* groupWith(owner.client);
        const venue = yield* catalogVenue(owner.client);
        const home = yield* owner.client.venues.create({
          payload: {
            id: ids.venue(),
            name: "Home game",
            kind: "home",
            city: null,
            region: null,
            country: null,
            groupId: group.group.id,
          },
        });
        for (const recorder of [owner, yield* device()]) {
          const opened = start(recorder.identity);
          expect(yield* recorder.push(opened)).toEqual(["accepted"]);
          const change = edit(recorder.identity, opened.visitId, 0, {
            table: { game: "roulette", venueId: home.id, highLimit: true },
          });
          for (const venueId of [home.id, ids.venue()]) {
            const { results } = yield* recorder.client.recording.push({
              payload: {
                identity: recorder.identity,
                commands: [
                  RecordingCommand.make({
                    ...change,
                    table: { game: "roulette", venueId, highLimit: true },
                  }),
                ],
              },
            });
            expect(results).toEqual([
              {
                operationId: change.operationId,
                status: "rejected",
                reason: "invalid",
                message: "Choose a public venue or leave the venue empty.",
              },
            ]);
            const history = yield* recorder.client.recording.history();
            expect(history.tables).toMatchObject([
              { id: opened.tableId, venueId: null, game: "blackjack", highLimit: false },
            ]);
            expect(history.visits[0]?.revision).toBe(0);
            expect(history.commands.map((command) => command.operationId)).toEqual([
              opened.operationId,
            ]);
          }
          expect(
            yield* recorder.push(
              RecordingCommand.make({
                ...change,
                table: { game: "roulette", venueId: venue.id, highLimit: true },
              }),
            ),
          ).toEqual(["accepted"]);
          expect((yield* recorder.client.recording.history()).tables).toMatchObject([
            { id: opened.tableId, venueId: venue.id, game: "roulette", highLimit: true },
          ]);
          expect(
            yield* recorder.push(
              edit(recorder.identity, opened.visitId, 1, {
                table: { game: "roulette", venueId: null, highLimit: true },
              }),
            ),
          ).toEqual(["accepted"]);
          expect((yield* recorder.client.recording.history()).tables).toMatchObject([
            { id: opened.tableId, venueId: null },
          ]);
        }
      }),
  );
});
