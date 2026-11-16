// Preview only: one realistic group, encoded through the real contract schemas.
import { JoinedTable, PlayerInvitePreview, TableView } from "@stacks/contracts/recordingCommands";
import {
  GroupDetail,
  GroupListItem,
  GroupStats,
  Invite,
  SessionDetail,
  TripDetail,
  Venue,
} from "@stacks/contracts";
import * as Schema from "effect/Schema";

const u = (n: number) => `0192e7a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = (day: number, hour: number) => new Date(Date.UTC(2026, 9, day, hour)).toISOString();
const ids = { group: u(1), trip: u(2), oldTrip: u(3), live: u(50) };
const P = [u(101), u(102), u(103), u(104), u(105), u(106)];
const names = ["Maya", "Priya", "Alexandria Montgomery-Vance", "Dev", "Jonah", "Sam"];
const players = P.map((id, i) => ({
  id,
  displayName: names[i],
  userId: i === 4 ? null : `user_${names[i]!.toLowerCase().split(" ")[0]}`,
  // Jonah is a guest; Sam left the group.
  role: i === 0 ? "owner" : i >= 4 ? null : "member",
  claimCode: i === 4 ? "JONAH-CLAIM" : null,
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
/** Tables recorded from Play and put in the trip: a finished one with a player outside the group. */
const tripTables = [
  {
    table: {
      id: u(700),
      tripId: ids.trip,
      game: "blackjack",
      venueId: u(320),
      highLimit: true,
      starterPlayerId: u(710),
    },
    venue: venue(20, "Bellagio"),
    startedAt: at(32, 20),
    endedAt: at(32, 23),
    minutesPlayed: 180,
    playerIds: [P[0], P[1]],
    playing: [],
    results: [result(0, [400, 950]), result(1, [300, 120])],
    inPlay: [],
    others: [{ displayName: "Dave", playing: false, net: -15000 }],
    myVisitId: u(720),
  },
  {
    table: {
      id: u(701),
      tripId: ids.trip,
      game: null,
      venueId: null,
      highLimit: false,
      starterPlayerId: u(711),
    },
    venue: null,
    startedAt: liveStart,
    endedAt: null,
    minutesPlayed: 0,
    playerIds: [P[3]],
    playing: [P[3]],
    results: [],
    inPlay: [{ playerId: P[3], buyIn: 20000 }],
    others: [],
    myVisitId: null,
  },
];
const tripDetail = {
  trip,
  sessions: [...summaries, liveSummary],
  tables: tripTables,
  balances: [
    [0, 18500],
    [1, 6000],
    [2, -2500],
    [3, -1500],
    [4, -20500],
  ].map(([p, a]) => ({ playerId: P[p!], amount: a })),
  stakes: [],
};
const groupDetail = {
  group: { id: ids.group, name: "Thursday crew", currency: "USD", createdAt: at(1, 12) },
  role: "owner",
  myPlayerId: P[0],
  players,
  trips: [trip, oldTrip],
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
const play = (
  id: string,
  tripId: string,
  game: string | null,
  venueId: string | null,
  startedAt: string,
  minutes: number,
  results: ReadonlyArray<{ playerId: string | undefined; buyIn: number; net: number }>,
) => ({
  id,
  tripId,
  game,
  venueId,
  startedAt,
  endedAt: new Date(Date.parse(startedAt) + minutes * 60_000).toISOString(),
  results: results.map(({ playerId, buyIn, net }) => ({
    playerId,
    buyIn,
    net,
    milliseconds: minutes * 60_000,
  })),
});
/** Atlantic City in the spring, then the Vegas weekend's finished sessions and table. */
const stats = {
  plays: [
    play(u(230), ids.oldTrip, "blackjack", u(330), at(1, 20), 150, [
      result(0, [300, 120]),
      result(1, [200, 380]),
      result(2, [400, 400]),
      result(3, [200, 520]),
    ]),
    play(u(231), ids.oldTrip, "slots", u(330), at(2, 2), 90, [
      result(0, [200, 610]),
      result(3, [300, 0]),
    ]),
    ...summaries.map((s) =>
      play(s.session.id, ids.trip, s.session.game, s.venue.id, s.session.startedAt, 120, s.results),
    ),
    play(
      tripTables[0]!.table.id,
      ids.trip,
      tripTables[0]!.table.game,
      tripTables[0]!.venue!.id,
      tripTables[0]!.startedAt,
      180,
      tripTables[0]!.results,
    ),
  ],
  venues: [
    ...new Map(
      [...summaries.map((s) => s.venue), tripTables[0]!.venue!, venue(30, "Borgata")].map((v) => [
        v.id,
        v,
      ]),
    ).values(),
  ],
};
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

/** The public catalog that venue search answers from, nearest to the Strip first. */
const catalog = [
  { ...venue(20, "Bellagio"), lat: 36.1126, lng: -115.1767 },
  { ...venue(21, "Aria"), lat: 36.1072, lng: -115.1765 },
  { ...venue(22, "Wynn Las Vegas"), lat: 36.1265, lng: -115.1657 },
  { ...venue(23, "Caesars Palace"), lat: 36.1162, lng: -115.1745 },
  { ...venue(24, "Borgata"), city: "Atlantic City", region: "NJ", lat: 39.378, lng: -74.4365 },
];

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
  "/api/public/venues": check(Schema.Array(Venue), catalog),
  ...Object.fromEntries(
    catalog.map((item) => [`/api/public/venues/${item.id}`, check(Venue, item)]),
  ),
  "/api/groups": check(Schema.Array(GroupListItem), groupList),
  [`/api/groups/${ids.group}`]: check(GroupDetail, groupDetail),
  [`/api/groups/${ids.group}/stats`]: check(GroupStats, stats),
  [`/api/groups/${ids.group}/invites`]: check(Schema.Array(Invite), invites),
  [`/api/trips/${ids.trip}`]: check(TripDetail, tripDetail),
  [`/api/trips/${ids.oldTrip}`]: check(TripDetail, {
    ...tripDetail,
    trip: oldTrip,
    sessions: summaries.slice(0, 2),
    tables: [],
  }),
  [`/api/groups/${work.group.id}`]: check(GroupDetail, workDetail),
  [`/api/groups/${work.group.id}/invites`]: check(Schema.Array(Invite), []),
  [`/api/groups/${fresh.group.id}`]: check(GroupDetail, fresh),
  [`/api/groups/${fresh.group.id}/invites`]: check(Schema.Array(Invite), []),
  [`/api/trips/${work.trip.id}`]: check(TripDetail, {
    trip: work.trip,
    sessions: [],
    tables: [],
    balances: [],
    stakes: [],
  }),
  [`/api/sessions/${ids.live}`]: check(SessionDetail, sessionDetail),
  "/api/shared/preview-token": check(TableView, sharedTable),
  "/api/invites/preview-invite": check(PlayerInvitePreview, {
    player: { id: shared(11), displayName: "Bea" },
    invitedBy: "Maya",
  }),
  "/api/invites/preview-invite/redeem": { id: shared(11), displayName: "Bea" },
};
