// Preview only: one realistic group, encoded through the real contract schemas.
import { JoinedTable, PlayerInvitePreview, TableView } from "@stacks/contracts/recordingCommands";
import {
  GroupDetail,
  GroupListItem,
  GroupStats,
  Invite,
  SessionDetail,
  TripDetail,
  UserLimits,
} from "@stacks/contracts";
import * as Schema from "effect/Schema";

const u = (n: number) => `0192e7a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = (day: number, hour: number) => new Date(Date.UTC(2026, 9, day, hour)).toISOString();
const ids = { group: u(1), trip: u(2), oldTrip: u(3), live: u(50) };
const P = [u(101), u(102), u(103), u(104), u(105), u(106)];
const names = ["Maya", "Priya", "Alexandria Montgomery-Vance", "Dev", "Jonah", "Sam"];
const handles = { venmo: null, cashApp: null, paypal: null };
const players = P.map((id, i) => ({
  id,
  displayName: names[i],
  userId: i === 4 ? null : `user_${names[i]!.toLowerCase().split(" ")[0]}`,
  // Jonah is a guest; Sam left the group.
  role: i === 0 ? "owner" : i >= 4 ? null : "member",
  claimCode: i === 4 ? "JONAH-CLAIM" : null,
  ...handles,
}));
const venue = (n: number, name: string) => ({
  id: u(300 + n),
  name,
  kind: "casino",
  city: "Las Vegas",
  region: "NV",
  country: "US",
  lat: null,
  lng: null,
  verified: true,
  groupId: null,
});
const trip = {
  id: ids.trip,
  groupId: ids.group,
  name: "Vegas Weekend",
  startedAt: at(30, 18),
  endedAt: null,
  createdBy: "user_maya",
  createdAt: at(30, 18),
};
const oldTrip = {
  id: ids.oldTrip,
  groupId: ids.group,
  name: "Atlantic City, spring",
  startedAt: at(1, 18),
  endedAt: at(3, 12),
  createdBy: "user_maya",
  createdAt: at(1, 18),
};
const raw: Array<[string, string, number, number, Record<number, [number, number]>]> = [
  ["Wynn", "blackjack", 30, 20, { 0: [300, 175], 1: [200, 270], 3: [200, 220], 4: [5000, 7500] }],
  [
    "The Cosmopolitan of Las Vegas",
    "roulette",
    30,
    23,
    { 0: [200, 260], 2: [400, 0], 3: [300, 200], 4: [8000, 4000] },
  ],
  ["Bellagio", "craps", 31, 1, { 1: [100, 0], 2: [300, 610], 4: [10000, 5500] }],
  [
    "Aria",
    "blackjack",
    31,
    20,
    { 0: [300, 640], 1: [200, 310], 2: [200, 0], 3: [500, 370], 4: [6000, 7500] },
  ],
  ["Caesars Palace", "baccarat", 31, 22, { 0: [500, 380], 2: [600, 900], 4: [12000, 9000] }],
  ["Wynn", "craps", 32, 1, { 0: [200, 345], 1: [100, 40], 3: [200, 0], 4: [4000, 6800] }],
];
const result = (p: number, [bi, co]: [number, number], live = false) => ({
  playerId: P[p],
  buyIn: bi * 100,
  cashOut: live ? 0 : co * 100,
  adjustment: 0,
  net: live ? 0 : (co - bi) * 100,
});
const summaries = raw.map(([v, game, d, h, rows], i) => ({
  session: {
    id: u(200 + i),
    groupId: ids.group,
    tripId: ids.trip,
    venueId: u(300 + i),
    game,
    status: "closed",
    startedAt: at(d, h),
    endedAt: at(d, h + 2),
    notes: null,
    tableSeats: null,
    highLimit: false,
  },
  venue: venue(
    raw.findIndex(([name]) => name === v),
    v,
  ),
  playerIds: Object.keys(rows).map((k) => P[+k]),
  playing: [],
  ledgerEntryIds: [],
  myLedgerEntries: [],
  results: Object.entries(rows).map(([k, r]) => result(+k, r)),
}));
const liveStart = new Date(Date.now() - 132 * 60_000).toISOString();
const liveRows: Record<number, [number, number]> = { 0: [300, 0], 3: [200, 0], 4: [3000, 0] };
const liveSession = {
  id: ids.live,
  groupId: ids.group,
  tripId: ids.trip,
  venueId: u(399),
  game: "blackjack",
  status: "live",
  startedAt: liveStart,
  endedAt: null,
  notes: null,
  tableSeats: 7,
  highLimit: false,
};
const liveSummary = {
  session: liveSession,
  venue: venue(99, "Bellagio"),
  playerIds: Object.keys(liveRows).map((k) => P[+k]),
  playing: Object.keys(liveRows).map((k) => P[+k]),
  myJoinedAt: liveStart,
  ledgerEntryIds: [u(601), u(602), u(603)],
  myLedgerEntries: [{ id: u(601), kind: "buy_in", amount: 30000, voidedAt: null }],
  results: Object.entries(liveRows).map(([k, r]) => result(+k, r, true)),
};
const tripDetail = {
  trip,
  sessions: [...summaries, liveSummary],
  balances: [
    [0, 18500],
    [1, 6000],
    [2, -2500],
    [3, -1500],
    [4, -20500],
  ].map(([p, a]) => ({ playerId: P[p!], amount: a })),
  transfers: [
    [4, 0, 18500],
    [4, 1, 2000],
    [2, 1, 2500],
    [3, 1, 1500],
  ].map(([f, t, a]) => ({ from: P[f!], to: P[t!], amount: a })),
  settlements: [],
  stakes: [],
};
const groupDetail = {
  group: { id: ids.group, name: "Thursday crew", currency: "USD", createdAt: at(1, 12) },
  role: "owner",
  myPlayerId: P[0],
  players,
  trips: [trip, oldTrip],
  unsettled: [{ tripId: ids.oldTrip, amount: 4500 }],
};
const groupList: Array<unknown> = [
  {
    group: groupDetail.group,
    role: "owner",
    myPlayerId: P[0],
    myBalance: 18500,
    liveSessionCount: 1,
    currentTripId: ids.trip,
    trips: [trip, oldTrip],
    mySession: { id: ids.live, tripId: ids.trip, venueName: "Bellagio", startedAt: liveStart },
  },
];
const work = {
  group: { id: u(9), name: "Work poker night", currency: "USD", createdAt: at(2, 12) },
  trip: {
    id: u(10),
    groupId: u(9),
    name: "Friday home games at Dev's place, winter league",
    startedAt: at(2, 18),
    endedAt: at(9, 23),
    createdBy: "user_maya",
    createdAt: at(2, 18),
  },
};
const workDetail = {
  group: work.group,
  role: "member",
  myPlayerId: P[0],
  players: players.slice(0, 2),
  trips: [work.trip],
  unsettled: [],
};
groupList.push({
  group: work.group,
  role: "member",
  myPlayerId: P[0],
  myBalance: 0,
  liveSessionCount: 0,
  currentTripId: null,
  trips: [work.trip],
  mySession: null,
});
// A group with a long name and no trips yet: only Group is offered until its first trip.
const fresh = {
  group: {
    id: u(20),
    name: "The Montgomery-Vance high rollers' society",
    currency: "USD",
    createdAt: at(30, 12),
  },
  role: "owner",
  myPlayerId: P[0],
  players: players.slice(0, 1),
  trips: [],
  unsettled: [],
};
groupList.push({
  group: fresh.group,
  role: "owner",
  myPlayerId: P[0],
  myBalance: 0,
  liveSessionCount: 0,
  currentTripId: null,
  trips: [],
  mySession: null,
});
const entry = (n: number, p: number, amount: number, mins: number) => ({
  id: u(600 + n),
  groupId: ids.group,
  sessionId: ids.live,
  tripId: null,
  kind: "buy_in",
  playerId: P[p],
  counterpartyId: null,
  amount,
  occurredAt: new Date(Date.now() - mins * 60_000).toISOString(),
  note: null,
  createdBy: "user_maya",
  createdAt: new Date(Date.now() - mins * 60_000).toISOString(),
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  replacesEntryId: null,
});
const sessionDetail = {
  session: liveSession,
  venue: venue(99, "Bellagio"),
  playerIds: liveSummary.playerIds,
  myJoinedAt: liveStart,
  results: liveSummary.results,
  entries: [entry(1, 0, 30000, 130), entry(2, 3, 20000, 120), entry(3, 4, 300000, 100)],
  seatings: [
    [0, 3],
    [3, 1],
    [4, 5],
  ].map(([p, seat], i) => ({
    id: u(700 + i),
    sessionId: ids.live,
    playerId: P[p!],
    seat,
    occurredAt: liveStart,
  })),
};
const stats = {
  sessionCount: summaries.length,
  minutesPlayed: 720,
  byPlayer: P.map((p, i) => ({
    playerId: p,
    buyIn: 0,
    cashOut: 0,
    adjustment: 0,
    net: [30000, 2000, 1000, -41000, -470000, 0][i],
  })),
  byGame: [{ key: "blackjack", sessionCount: 2, results: summaries[0]!.results }],
  byVenue: [...Map.groupBy(summaries, (s) => s.venue.id).values()].map((played) => ({
    key: played[0]!.venue,
    sessionCount: played.length,
    results: played.flatMap((s) => s.results),
  })),
  bySeat: [],
  bySession: summaries.map((s) => ({
    sessionId: s.session.id,
    tripId: ids.trip,
    venueId: s.venue.id,
    startedAt: s.session.startedAt,
    results: s.results,
  })),
};
const limits = { lossLimit: 50000, currency: "USD", sessionReminderMinutes: 120 };
const invites = [
  {
    id: u(800),
    groupId: ids.group,
    code: "CREW-2026",
    expiresAt: at(30, 0),
    maxUses: null,
    uses: 3,
    revokedAt: null,
  },
];

const shared = (n: number) => `0192e7a0-0000-7000-8000-0000000009${n.toString().padStart(2, "0")}`;
/** A table its starter shared, as the read-only link shows it. */
const sharedTable = {
  table: {
    id: shared(1),
    tripId: null,
    game: "blackjack",
    venueId: null,
    highLimit: false,
    starterPlayerId: shared(10),
  },
  players: [
    { id: shared(10), displayName: "Maya" },
    { id: shared(11), displayName: "Bea" },
  ],
  visits: [
    {
      visit: {
        id: shared(20),
        tableId: shared(1),
        playerId: shared(10),
        startedAt: "2026-11-07T21:00:00.000Z",
        finishedAt: null,
        revision: 1,
      },
      totals: { buyIn: 30000, cashOut: 0, adjustment: 0 },
      finalResult: null,
    },
    {
      visit: {
        id: shared(21),
        tableId: shared(1),
        playerId: shared(11),
        startedAt: "2026-11-07T21:10:00.000Z",
        finishedAt: "2026-11-07T21:50:00.000Z",
        revision: 1,
      },
      totals: { buyIn: 10000, cashOut: 16500, adjustment: 0 },
      finalResult: 6500,
    },
  ],
  viewerRole: "viewer",
  viewerPlayerId: null,
  recorders: [],
  appointable: [],
  shared: false,
};
/** Joining the shared table through its link, as Cal. */
const joinedAs = { id: shared(12), displayName: "Cal" };

// Decoding first checks every fixture against the contract, so a wrong field fails loudly here.
const check = <S extends Schema.Top>(schema: S, value: unknown) => {
  const json = Schema.toCodecJson(schema as never);
  return Schema.encodeSync(json)(Schema.decodeUnknownSync(json)(value));
};
export const routes: Record<string, unknown> = {
  "/api/recording": {
    identity: null,
    commands: [],
    tables: [],
    participants: [],
    players: [],
    visits: [],
    entries: [],
  },
  "/api/shared/preview-token/join": check(JoinedTable, {
    table: sharedTable.table,
    player: joinedAs,
  }),
  [`/api/tables/${shared(1)}`]: check(TableView, {
    ...sharedTable,
    players: [...sharedTable.players, joinedAs],
    viewerRole: "participant",
    viewerPlayerId: joinedAs.id,
  }),
  "/api/groups": check(Schema.Array(GroupListItem), groupList),
  [`/api/groups/${ids.group}`]: check(GroupDetail, groupDetail),
  [`/api/groups/${ids.group}/stats`]: check(GroupStats, stats),
  [`/api/groups/${ids.group}/invites`]: check(Schema.Array(Invite), invites),
  [`/api/trips/${ids.trip}`]: check(TripDetail, tripDetail),
  [`/api/trips/${ids.oldTrip}`]: check(TripDetail, {
    ...tripDetail,
    trip: oldTrip,
    sessions: summaries.slice(0, 2),
  }),
  [`/api/groups/${work.group.id}`]: check(GroupDetail, workDetail),
  [`/api/groups/${work.group.id}/invites`]: check(Schema.Array(Invite), []),
  [`/api/groups/${fresh.group.id}`]: check(GroupDetail, fresh),
  [`/api/groups/${fresh.group.id}/invites`]: check(Schema.Array(Invite), []),
  [`/api/trips/${work.trip.id}`]: check(TripDetail, {
    trip: work.trip,
    sessions: [],
    balances: [],
    transfers: [],
    settlements: [],
    stakes: [],
  }),
  [`/api/trips/${work.trip.id}/limits`]: check(UserLimits, limits),
  [`/api/trips/${ids.trip}/limits`]: check(UserLimits, limits),
  [`/api/trips/${ids.oldTrip}/limits`]: check(UserLimits, limits),
  [`/api/sessions/${ids.live}`]: check(SessionDetail, sessionDetail),
  "/api/shared/preview-token": check(TableView, sharedTable),
  "/api/invites/preview-invite": check(PlayerInvitePreview, {
    player: { id: shared(11), displayName: "Bea" },
    startedBy: "Maya",
  }),
  "/api/invites/preview-invite/redeem": { id: shared(11), displayName: "Bea" },
};
