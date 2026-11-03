// Throwaway prototype data: a 2-night Vegas trip, five players, one high roller, one live session.
import * as DateTime from "effect/DateTime";

const P = { maya: "p-maya", priya: "p-priya", alex: "p-alex", dev: "p-dev", jonah: "p-jonah" };
export const me = P.maya;
const at = (day: number, hour: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, day, hour));

export const players = [
  { id: P.maya, displayName: "Maya", userId: "u1", role: "owner", claimCode: null },
  { id: P.priya, displayName: "Priya", userId: "u2", role: "member", claimCode: null },
  { id: P.alex, displayName: "Alexandria Montgomery-Vance", userId: "u3", role: "member", claimCode: null },
  { id: P.dev, displayName: "Dev", userId: "u4", role: "member", claimCode: null },
  { id: P.jonah, displayName: "Jonah", userId: null, role: null, claimCode: "abc" },
];

// [venue, game, day, hour, { player: [buyIn, cashOut] }] in dollars
const raw: Array<[string, string, number, number, Record<string, [number, number]>]> = [
  ["Wynn", "blackjack", 30, 20, { [P.maya]: [300, 175], [P.priya]: [200, 270], [P.dev]: [200, 220], [P.jonah]: [5000, 7500] }],
  ["The Cosmopolitan of Las Vegas", "roulette", 30, 23, { [P.maya]: [200, 260], [P.alex]: [400, 0], [P.dev]: [300, 200], [P.jonah]: [8000, 4000] }],
  ["Bellagio", "craps", 31, 1, { [P.priya]: [100, 0], [P.alex]: [300, 610], [P.jonah]: [10000, 5500] }],
  ["Aria", "blackjack", 31, 20, { [P.maya]: [300, 640], [P.priya]: [200, 310], [P.alex]: [200, 0], [P.dev]: [500, 370], [P.jonah]: [6000, 7500] }],
  ["Caesars Palace", "baccarat", 31, 22, { [P.maya]: [500, 380], [P.alex]: [600, 900], [P.jonah]: [12000, 9000] }],
  ["Wynn", "craps", 32, 1, { [P.maya]: [200, 345], [P.priya]: [100, 40], [P.dev]: [200, 0], [P.jonah]: [4000, 6800] }],
];

const session = (i: number, [venue, game, day, hour, rows]: (typeof raw)[number], live = false) => ({
  session: {
    id: `s${i}`,
    tripId: "t1",
    status: live ? "live" : "closed",
    startedAt: live ? DateTime.makeUnsafe(Date.now() - 132 * 60_000) : at(day, hour),
    endedAt: null,
    game,
    highLimit: false,
    notes: null,
  },
  venue: { id: `v-${venue}`, name: venue },
  playerIds: Object.keys(rows),
  playing: live ? Object.keys(rows) : [],
  results: Object.entries(rows).map(([playerId, [buyIn, cashOut]]) => ({
    playerId,
    buyIn: buyIn * 100,
    cashOut: cashOut * 100,
    adjustment: 0,
    net: live ? 0 : (cashOut - buyIn) * 100,
  })),
});

const liveRaw: (typeof raw)[number] = ["Bellagio", "blackjack", 32, 21, { [P.maya]: [300, 0], [P.dev]: [200, 0], [P.jonah]: [3000, 0] }];

export const trip = {
  trip: { id: "t1", groupId: "g1", name: "Vegas Weekend", startedAt: at(30, 18), endedAt: null, createdBy: "u1" },
  sessions: [...raw.map((r, i) => session(i, r)), session(9, liveRaw, true)],
  balances: [
    { playerId: P.maya, amount: 18500 },
    { playerId: P.priya, amount: 6000 },
    { playerId: P.alex, amount: -2500 },
    { playerId: P.dev, amount: -1500 },
    { playerId: P.jonah, amount: -20500 },
  ],
  transfers: [
    { from: P.jonah, to: P.maya, amount: 18500 },
    { from: P.jonah, to: P.priya, amount: 2000 },
    { from: P.alex, to: P.priya, amount: 2500 },
    { from: P.dev, to: P.priya, amount: 1500 },
  ],
  settlements: [],
  stakes: [],
} as never as import("@stacks/contracts").TripDetail;

export const group = {
  group: { id: "g1", name: "Thursday crew", currency: "USD", createdAt: at(1, 12) },
  role: "owner",
  myPlayerId: me,
  players,
  trips: [
    trip.trip,
    { id: "t0", groupId: "g1", name: "Atlantic City, spring", startedAt: at(1, 18), endedAt: at(3, 12), createdBy: "u1" },
  ],
  unsettled: [],
} as never as import("@stacks/contracts").GroupDetail;

export const currency = group.group.currency;
export const closed = trip.sessions.filter((s) => s.session.status === "closed");
export const live = trip.sessions.find((s) => s.session.status === "live")!;
export const chipIndex = (id: string) => players.findIndex((p) => p.id === id) + 1;
export const nameOf = (id: string) => players.find((p) => p.id === id)!.displayName;
