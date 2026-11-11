import {
  PlayerId,
  type ActorId,
  type EntryId,
  type PairHistory,
  type PlayerBalances,
  type PlayEntry,
  type PlayerIdentity,
  type PlayerInviteId,
  type TableId,
  type UserId,
} from "@stacks/contracts";
import {
  isPairCommand,
  isTableCommand,
  RecordingCommand,
  RecordingOperationId,
  type ActorCredential,
  type JoinedTable,
  type JoinTableRequest,
  type PlayerAccess,
  type PlayerInviteLink,
  type RedeemInviteRequest,
  type ShareLink,
  type TableView,
  type PushRecordingRequest,
  type PushRecordingResponse,
  type RecordingCommandResult,
  type RecordingHistory,
} from "@stacks/contracts/recordingCommands";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";

import { applyRecordingCommand, createdEntryIds, RecordingError } from "@stacks/shared/recording";

import { newId } from "./ids.ts";
import { prepareRecordingCommand, type RecordingInput, type RecordingStore } from "./recording.ts";
import { recordingBase, type RecordingRejection, type RecordingState } from "./recordingState.ts";

/**
 * The API as sync uses it. Given an actor credential, a call proves the device's actor instead of
 * sending the account's session.
 */
export interface RecordingTransport {
  readonly history: (actor: ActorCredential | null) => Effect.Effect<RecordingHistory, unknown>;
  readonly push: (
    request: PushRecordingRequest,
    actor: ActorCredential | null,
  ) => Effect.Effect<PushRecordingResponse, unknown>;
  readonly registerActor: (actor: ActorCredential) => Effect.Effect<void, unknown>;
  readonly claimActor: (actor: ActorCredential) => Effect.Effect<void, unknown>;
  readonly share: (
    tableId: TableId,
    actor: ActorCredential | null,
  ) => Effect.Effect<ShareLink, unknown>;
  readonly unshare: (
    tableId: TableId,
    actor: ActorCredential | null,
  ) => Effect.Effect<void, unknown>;
  readonly table: (
    tableId: TableId,
    actor: ActorCredential | null,
  ) => Effect.Effect<TableView, unknown>;
  readonly join: (
    token: string,
    request: JoinTableRequest,
    actor: ActorCredential | null,
  ) => Effect.Effect<JoinedTable, unknown>;
  readonly invitePlayer: (
    playerId: PlayerId,
    actor: ActorCredential | null,
  ) => Effect.Effect<PlayerInviteLink, unknown>;
  readonly playerAccess: (
    playerId: PlayerId,
    actor: ActorCredential | null,
  ) => Effect.Effect<PlayerAccess, unknown>;
  readonly revokeBinding: (
    playerId: PlayerId,
    actorId: ActorId,
    actor: ActorCredential | null,
  ) => Effect.Effect<void, unknown>;
  readonly revokeInvite: (
    inviteId: PlayerInviteId,
    actor: ActorCredential | null,
  ) => Effect.Effect<void, unknown>;
  readonly redeemInvite: (
    token: string,
    request: RedeemInviteRequest,
    actor: ActorCredential | null,
  ) => Effect.Effect<PlayerIdentity, unknown>;
  readonly balances: (actor: ActorCredential | null) => Effect.Effect<PlayerBalances, unknown>;
  readonly pair: (
    playerId: PlayerId,
    actor: ActorCredential | null,
  ) => Effect.Effect<PairHistory, unknown>;
}

/** Whether the server has the table, so it can be shared. */
export const tableSynced = (state: RecordingState, tableId: TableId) => {
  const synced = new Set(state.sync?.synced);
  return state.receipts.some(
    ({ command }) =>
      (command.type === "start" || command.type === "record_completed") &&
      command.tableId === tableId &&
      synced.has(command.operationId),
  );
};

/** Where a platform keeps the device actor's secret: never in the ledger, never synced. */
export interface ActorKeyStorage {
  readonly load: () => Promise<ActorCredential | null>;
  readonly save: (credential: ActorCredential) => Promise<void>;
}

const newSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

/** The saved credential for `actorId`, or a new one, saved before it's used. */
const actorCredential = async (
  keys: ActorKeyStorage,
  actorId: ActorCredential["actorId"],
): Promise<ActorCredential> => {
  const saved = await keys.load();
  if (saved?.actorId === actorId) return saved;
  const credential = { actorId, secret: newSecret() };
  await keys.save(credential);
  return credential;
};

/**
 * Whether a signed-out device syncs as its own actor: once it has, or once a table of its has
 * someone else at it. Solo play stays on the device until an account takes it.
 */
export const syncsAsDevice = (state: RecordingState) =>
  state.sync === undefined
    ? state.visits.some((visit) => visit.playerId !== state.self.id)
    : state.sync.userId === null;

/** This device's history belongs to another account, so nothing syncs while this one is in. */
export class RecordingSyncBlocked extends Error {
  override readonly name = "RecordingSyncBlocked";
  constructor() {
    super("The sessions on this device belong to another account.");
  }
}

/** The most commands one push carries; the contract caps a batch at 100. */
const BATCH = 100;

const commandText = (() => {
  const encode = Schema.encodeSync(Schema.toCodecJson(RecordingCommand));
  return (command: RecordingCommand) => JSON.stringify(encode(command));
})();

const rejectionOf = (command: RecordingCommand, error: unknown): RecordingRejection => {
  if (!(error instanceof RecordingError)) throw error;
  return {
    command,
    reason:
      error.reason === "conflict" || error.reason === "operation_reused" ? error.reason : "invalid",
    message: error.message,
  };
};

/**
 * Applies commands in order onto `state`, setting aside the ones the rules now refuse. Commands
 * the server already accepted (`onServer`) apply as it accepted them, whichever actor made them.
 */
const replay = (
  state: RecordingState,
  commands: ReadonlyArray<RecordingCommand>,
  onServer: ReadonlySet<string> = new Set(),
) => {
  const failed: RecordingRejection[] = [];
  let current = state;
  for (const command of commands) {
    try {
      current = applyRecordingCommand(
        current,
        command,
        onServer.has(command.operationId) ? null : undefined,
      );
    } catch (error) {
      failed.push(rejectionOf(command, error));
    }
  }
  return { state: current, failed };
};

/** Adds a table this device joined, as the player it joined as. Joining again changes nothing. */
export const addJoinedTable = (state: RecordingState, joined: JoinedTable): RecordingState =>
  state.participants.some((item) => item.playerId === joined.player.id)
    ? state
    : {
        ...state,
        players: [...state.players, joined.player],
        participants: [
          ...state.participants,
          { tableId: joined.table.id, playerId: joined.player.id },
        ],
        tables: state.tables.some((table) => table.id === joined.table.id)
          ? state.tables
          : [...state.tables, joined.table],
      };

/** Saved commands the server hasn't confirmed, oldest first. */
export const pendingRecordingCommands = (state: RecordingState) => {
  const synced = new Set(state.sync?.synced);
  return state.receipts.map((receipt) => receipt.command).filter((c) => !synced.has(c.operationId));
};

/**
 * Links this device's ledger to the account and folds in its server history: the server's
 * commands first, then this device's pending ones. A device that never synced adopts the
 * account's identity, so its history joins the account's instead of becoming a second player.
 */
export const mergeRecordingHistory = (
  state: RecordingState,
  userId: UserId | null,
  history: RecordingHistory,
): RecordingState => {
  // A device that synced as its actor has had that player claimed by the account by now.
  if (state.sync && state.sync.userId !== null && state.sync.userId !== userId)
    throw new RecordingSyncBlocked();
  const identity = history.identity;
  const adopt =
    identity !== null &&
    (identity.playerId !== state.self.id || identity.actorId !== state.actor.id);
  if (adopt && (state.sync?.synced.length ?? 0) > 0)
    throw new RecordingError("load", "This device already synced as a different player.");
  const actorId = identity?.actorId ?? state.actor.id;
  const playerId = identity?.playerId ?? state.self.id;
  const own = (command: RecordingCommand) =>
    adopt
      ? RecordingCommand.make(
          "playerId" in command && command.playerId === state.self.id
            ? { ...command, actorId, playerId }
            : { ...command, actorId },
        )
      : command;
  const remote = new Map(history.commands.map((command) => [command.operationId, command]));
  const local = state.receipts.map((receipt) => own(receipt.command));
  const reused = local
    .filter((c) => remote.has(c.operationId))
    .filter((c) => commandText(remote.get(c.operationId)!) !== commandText(c))
    .map((command) => rejectionOf(command, new RecordingError("operation_reused", "")));
  const self = identity ? { ...state.self, id: identity.playerId } : state.self;
  // Who joined which tables comes from the server, with the tables this device joined.
  const base: RecordingState = {
    ...state,
    self,
    actor: { id: actorId, userId: null },
    players: [
      ...new Map(
        [self, ...history.participants.map((item) => item.player), ...history.players].map(
          (player) => [player.id, player],
        ),
      ).values(),
    ],
    participants: history.participants.map((item) => ({
      tableId: item.tableId,
      playerId: item.player.id,
    })),
    recorders: [],
    tables: history.tables.filter((table) => table.starterPlayerId !== self.id),
    visits: [],
    entries: [],
    repayments: [],
    receipts: [],
  };
  const synced = replay(
    base,
    history.commands,
    new Set(history.commands.map((command) => command.operationId)),
  );
  if (synced.failed.length > 0)
    throw new RecordingError("load", "The synced history doesn't follow the recording rules.");
  const merged = replay(
    synced.state,
    local.filter((c) => !remote.has(c.operationId)),
  );
  return {
    ...merged.state,
    sync: {
      userId,
      synced: history.commands.map((command) => command.operationId),
      rejected: [
        ...(state.sync?.rejected ?? []).map((item) => ({ ...item, command: own(item.command) })),
        ...reused,
        ...merged.failed,
      ].filter((item) => !settled(item.command, remote, merged.state)),
    },
  };
};

const ms = (time: DateTime.Utc) => DateTime.toEpochMillis(time);

/**
 * Whether the account already has what a refused command recorded: this very operation, or the
 * same facts under another one (a restored backup, another device's copy). Then the refusal is
 * settled, and recording it again would count the money twice. An operation the server holds
 * with different content stays refused, as does anything whose facts differ in any way.
 */
const settled = (
  command: RecordingCommand,
  remote: ReadonlyMap<string, RecordingCommand>,
  ledger: RecordingState,
) => {
  const held = remote.get(command.operationId);
  if (held) return commandText(held) === commandText(command);
  if (isTableCommand(command)) return false;
  if (isPairCommand(command)) {
    const payment = (
      id: string,
      details: { readonly amount: number; readonly occurredAt: DateTime.Utc; note: string | null },
    ) =>
      ledger.repayments.some(
        (item) =>
          item.id === id &&
          item.amount === details.amount &&
          ms(item.occurredAt) === ms(details.occurredAt) &&
          item.note === details.note,
      );
    if (command.type === "repay")
      return (
        payment(command.repaymentId, command) &&
        ledger.repayments.some(
          (item) =>
            item.id === command.repaymentId &&
            item.fromPlayerId === command.fromPlayerId &&
            item.toPlayerId === command.toPlayerId,
        )
      );
    const original = ledger.repayments.find((item) => item.id === command.repaymentId);
    return (
      original !== undefined &&
      original.voidedAt !== null &&
      original.voidReason === command.reason &&
      (command.type === "void_repayment" || payment(command.replacement.id, command.replacement))
    );
  }
  const visit = ledger.visits.find((item) => item.id === command.visitId);
  if (!visit) return false;
  const entry = (
    id: string,
    kind: PlayEntry["kind"],
    amount: number,
    occurredAt: DateTime.Utc,
    note: string | null = null,
  ) =>
    ledger.entries.some(
      (item) =>
        item.id === id &&
        item.visitId === visit.id &&
        item.kind === kind &&
        item.amount === amount &&
        ms(item.occurredAt) === ms(occurredAt) &&
        item.note === note,
    );
  const finishedAt = (at: DateTime.Utc) =>
    visit.finishedAt !== null && ms(visit.finishedAt) === ms(at);
  switch (command.type) {
    case "start":
    case "record_completed": {
      const table = ledger.tables.find((item) => item.id === visit.tableId);
      return (
        table !== undefined &&
        table.id === command.tableId &&
        table.game === command.game &&
        table.venueId === command.venueId &&
        table.highLimit === command.highLimit &&
        ms(visit.startedAt) === ms(command.startedAt) &&
        entry(command.buyInId, "buy_in", command.buyIn, command.startedAt) &&
        (command.type === "start" ||
          (entry(command.cashOutId, "cash_out", command.cashOut, command.finishedAt) &&
            finishedAt(command.finishedAt)))
      );
    }
    case "join_table":
      return (
        visit.tableId === command.tableId &&
        visit.playerId === command.playerId &&
        ms(visit.startedAt) === ms(command.startedAt) &&
        entry(command.buyInId, "buy_in", command.buyIn, command.startedAt)
      );
    case "add":
      return entry(command.entryId, command.kind, command.amount, command.occurredAt, command.note);
    case "finish":
      return (
        entry(command.entryId, "cash_out", command.amount, command.finishedAt) &&
        finishedAt(command.finishedAt)
      );
    case "correct": {
      const original = ledger.entries.find(
        (item) => item.id === command.entryId && item.visitId === visit.id,
      );
      return (
        original !== undefined &&
        original.voidedAt !== null &&
        original.voidReason === command.reason &&
        (command.replacement === null ||
          entry(
            command.replacement.id,
            original.kind,
            command.replacement.amount,
            command.replacement.occurredAt,
            command.replacement.note,
          ))
      );
    }
    case "reopen":
      return false;
  }
};

/**
 * Marks what the server accepted, and moves what it refused, with what depended on it locally,
 * aside. A command the server accepted is never refused here, even if it no longer applies on
 * this device: another device changed the visit, so it leaves the ledger until the next pull
 * brings the server's version back.
 */
export const applyPushResults = (
  state: RecordingState,
  results: ReadonlyArray<RecordingCommandResult>,
): RecordingState => {
  const sync = state.sync;
  if (!sync) throw new RecordingError("invalid", "Link an account before syncing.");
  const known = new Set(state.receipts.map((receipt) => receipt.command.operationId));
  const accepted = results
    .filter((result) => result.status === "accepted" && known.has(result.operationId))
    .map((result) => result.operationId);
  const refused = new Map(
    results.flatMap((result) =>
      result.status === "rejected" ? [[result.operationId, result]] : [],
    ),
  );
  const synced = [...new Set([...sync.synced, ...accepted])];
  if (refused.size === 0) return { ...state, sync: { ...sync, synced } };
  const commands = state.receipts.map((receipt) => receipt.command);
  const rebuilt = replay(
    recordingBase(state),
    commands.filter((c) => !refused.has(c.operationId)),
    new Set(synced),
  );
  const rejected = commands.flatMap((command) => {
    const result = refused.get(command.operationId);
    return result?.status === "rejected"
      ? [{ command, reason: result.reason, message: result.message }]
      : [];
  });
  const onServer = new Set(synced);
  const dropped = new Set(rebuilt.failed.map((item) => item.command.operationId));
  return {
    ...rebuilt.state,
    sync: {
      ...sync,
      synced: synced.filter((id) => !dropped.has(id)),
      rejected: [
        ...sync.rejected,
        ...rejected,
        ...rebuilt.failed.filter((item) => !onServer.has(item.command.operationId)),
      ],
    },
  };
};

const optional = <K extends string, V>(key: K, value: V | null) =>
  (value === null ? {} : { [key]: value }) as { [P in K]?: V };

/**
 * What the person recorded, to record again against the ledger as it is now. `ids` maps the
 * visit and entries of a start recorded again to their new IDs.
 */
const inputOf = (command: RecordingCommand, ids: ReadonlyMap<string, string>): RecordingInput => {
  if (isTableCommand(command))
    return { type: command.type, tableId: command.tableId, playerId: command.playerId };
  if (isPairCommand(command)) {
    const repaymentId = (ids.get(command.repaymentId) ?? command.repaymentId) as EntryId;
    switch (command.type) {
      case "repay":
        return {
          type: "repay",
          fromPlayerId: command.fromPlayerId,
          toPlayerId: command.toPlayerId,
          amount: command.amount,
          occurredAt: command.occurredAt,
          ...optional("note", command.note),
        };
      case "correct_repayment":
        return {
          type: "correct_repayment",
          repaymentId,
          reason: command.reason,
          amount: command.replacement.amount,
          occurredAt: command.replacement.occurredAt,
          note: command.replacement.note ?? "",
        };
      case "void_repayment":
        return { type: "void_repayment", repaymentId, reason: command.reason };
    }
  }
  const visitId = (ids.get(command.visitId) ?? command.visitId) as typeof command.visitId;
  switch (command.type) {
    case "start":
    case "record_completed": {
      const start = {
        buyIn: command.buyIn,
        startedAt: command.startedAt,
        highLimit: command.highLimit,
        ...optional("game", command.game),
        ...optional("venueId", command.venueId),
      };
      return command.type === "start"
        ? { type: "start", ...start }
        : {
            type: "record_completed",
            ...start,
            startedAt: command.startedAt,
            cashOut: command.cashOut,
            finishedAt: command.finishedAt,
          };
    }
    case "join_table":
      return {
        type: "join_table",
        tableId: (ids.get(command.tableId) ?? command.tableId) as typeof command.tableId,
        playerId: command.playerId,
        buyIn: command.buyIn,
        startedAt: command.startedAt,
        ...optional("displayName", command.newPlayer?.displayName ?? null),
        ...optional("counterpartyId", command.counterpartyId ?? null),
      };
    case "add":
      return {
        type: "add",
        visitId,
        kind: command.kind,
        amount: command.amount,
        occurredAt: command.occurredAt,
        ...optional("note", command.note),
        ...optional("counterpartyId", command.counterpartyId ?? null),
      };
    case "finish":
      return {
        type: "finish",
        visitId,
        amount: command.amount,
        finishedAt: command.finishedAt,
        ...optional("counterpartyId", command.counterpartyId ?? null),
      };
    case "correct":
      return {
        type: "correct",
        visitId,
        entryId: (ids.get(command.entryId) ?? command.entryId) as typeof command.entryId,
        reason: command.reason,
        replacement: command.replacement && {
          amount: command.replacement.amount,
          occurredAt: command.replacement.occurredAt,
          ...optional("note", command.replacement.note),
          ...optional("counterpartyId", command.replacement.counterpartyId ?? null),
        },
      };
    case "reopen":
      return { type: "reopen", visitId, reason: command.reason };
  }
};

const withoutRejection = (state: RecordingState, operationId: RecordingOperationId) => {
  const sync = state.sync;
  const rejection = sync?.rejected.find((item) => item.command.operationId === operationId);
  if (!sync || !rejection) throw new RecordingError("invalid", "That change is already resolved.");
  return {
    rejection,
    state: {
      ...state,
      sync: {
        ...sync,
        rejected: sync.rejected.filter((item) => item !== rejection),
      },
    },
  };
};

/** Gives up on a refused change. Nothing else in the ledger changes. */
export const discardRejected = (state: RecordingState, operationId: RecordingOperationId) =>
  withoutRejection(state, operationId).state;

/**
 * Records a refused change again as a new command against the ledger as it is now. A refused
 * start brings the refused play that depended on it along, moved to the new visit, so offline
 * rebuys aren't lost. Throws the rule a change still breaks, and keeps every refusal.
 */
export const recordRejectedAgain = (state: RecordingState, operationId: RecordingOperationId) => {
  const { rejection } = withoutRejection(state, operationId);
  const refused = rejection.command;
  const chain =
    refused.type === "start" || refused.type === "record_completed"
      ? state.sync!.rejected.filter(
          (item) =>
            item === rejection ||
            ("visitId" in item.command && item.command.visitId === refused.visitId),
        )
      : [rejection];
  const ids = new Map<string, string>();
  let next = state;
  for (const item of chain) {
    next = withoutRejection(next, item.command.operationId).state;
    const command = prepareRecordingCommand(next, inputOf(item.command, ids));
    if ("visitId" in item.command && "visitId" in command)
      ids.set(item.command.visitId, command.visitId);
    if ("tableId" in item.command && "tableId" in command)
      ids.set(item.command.tableId, command.tableId);
    const before = createdEntryIds(item.command);
    createdEntryIds(command).forEach((id, index) => ids.set(before[index]!, id));
    next = applyRecordingCommand(next, command);
  }
  return next;
};

export type RecordingSyncStatus = {
  /** `retrying` waits out a failure that more signal or time can fix; `blocked` waits for a person. */
  readonly phase: "idle" | "syncing" | "retrying" | "blocked";
  readonly error: unknown | null;
};

const MAX_DELAY = Duration.minutes(5);

/**
 * Syncs the device ledger to an account, or signed out (`userId` null) as the device's own actor:
 * pulls once, then pushes whatever is pending, and again whenever something new is saved or
 * `wake` says the network may be back. Failures back off from one second to five minutes; a wake
 * cuts the wait short.
 */
export const makeRecordingSync = (
  store: RecordingStore,
  userId: UserId | null,
  transport: RecordingTransport,
  keys: ActorKeyStorage,
) => {
  let status: RecordingSyncStatus = { phase: "idle", error: null };
  const listeners = new Set<() => void>();
  const setStatus = (next: RecordingSyncStatus) => {
    status = next;
    for (const listener of listeners) listener();
  };
  let pull = true;
  let signal: ((reason: "wake" | "change") => void) | null = null;

  const transform = (change: (state: RecordingState) => RecordingState) =>
    Effect.tryPromise({ try: () => store.transform(change), catch: (error) => error });

  const active = (state: RecordingState | null) =>
    state !== null && (userId !== null || syncsAsDevice(state));
  const credential = (state: RecordingState) =>
    Effect.tryPromise({ try: () => actorCredential(keys, state.actor.id), catch: (e) => e });
  let prepared = false;

  const round = Effect.gen(function* () {
    const loaded = store.getSnapshot().state;
    if (!active(loaded)) return setStatus({ phase: "idle", error: null });
    setStatus({ phase: "syncing", error: null });
    const actor = userId === null ? yield* credential(loaded!) : null;
    if (!prepared) {
      if (actor) yield* transport.registerActor(actor);
      // The device synced as its actor before this sign-in: the account takes that player.
      else if (loaded!.sync?.userId === null)
        yield* transport
          .claimActor(yield* credential(loaded!))
          .pipe(
            Effect.mapError((error) =>
              isIdentityConflict(error) ? new RecordingSyncBlocked() : error,
            ),
          );
      prepared = true;
    }
    for (;;) {
      if (pull) {
        const history = yield* transport.history(actor);
        yield* transform((state) => mergeRecordingHistory(state, userId, history));
        pull = false;
      }
      const state = store.getSnapshot().state;
      if (!state) return yield* Effect.fail(new RecordingError("load", "Recording isn't loaded."));
      const commands = pendingRecordingCommands(state).slice(0, BATCH);
      if (commands.length === 0) break;
      const response = yield* transport
        .push({ identity: { playerId: state.self.id, actorId: state.actor.id }, commands }, actor)
        .pipe(
          Effect.tapError((error) =>
            Effect.sync(() => {
              // Another device established the account first: adopt it on the next try.
              if (isIdentityConflict(error)) pull = true;
            }),
          ),
        );
      yield* transform((current) => applyPushResults(current, response.results));
      // A refusal can mean another device changed the visit: converge on the server's ledger.
      if (response.results.some((result) => result.status === "rejected")) pull = true;
    }
    setStatus({ phase: "idle", error: null });
  });

  const run = Effect.gen(function* () {
    const wakes = yield* Queue.sliding<"wake" | "change">(1);
    signal = (reason) => Queue.offerUnsafe(wakes, reason);
    const unsubscribe = store.subscribe(() => {
      const state = store.getSnapshot().state;
      if (state && active(state) && pendingRecordingCommands(state).length > 0) signal?.("change");
    });
    yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));
    let attempt = 0;
    for (;;) {
      const failure = yield* round.pipe(
        Effect.as(null),
        Effect.catch((error) => Effect.succeed({ error })),
      );
      if (failure === null) {
        attempt = 0;
        if ((yield* Queue.take(wakes)) === "wake") pull = true;
        continue;
      }
      const { error } = failure;
      if (error instanceof RecordingSyncBlocked) {
        setStatus({ phase: "blocked", error });
        yield* Queue.take(wakes);
        pull = true;
        continue;
      }
      setStatus({ phase: "retrying", error });
      const delay = Duration.min(Duration.times(Duration.seconds(1), 2 ** attempt), MAX_DELAY);
      attempt += 1;
      const woke = yield* Effect.raceFirst(Effect.as(Effect.sleep(delay), null), Queue.take(wakes));
      if (woke === "wake") pull = true;
    }
  }).pipe(Effect.scoped, Effect.ensuring(Effect.sync(() => (signal = null))));

  const online = async <A>(
    call: (actor: ActorCredential | null) => Effect.Effect<A, unknown>,
  ): Promise<A> => {
    const state = store.getSnapshot().state;
    if (!state) throw new RecordingError("load", "Recording isn't loaded.");
    const actor = userId === null ? await actorCredential(keys, state.actor.id) : null;
    return Effect.runPromise(call(actor));
  };

  const sharing = async <A>(
    tableId: TableId,
    call: (tableId: TableId, actor: ActorCredential | null) => Effect.Effect<A, unknown>,
  ) => {
    const state = store.getSnapshot().state;
    if (!state || !tableSynced(state, tableId))
      throw new RecordingError("invalid", "This table hasn't synced yet. Try again once it has.");
    const actor = userId === null ? await actorCredential(keys, state.actor.id) : null;
    return Effect.runPromise(call(tableId, actor));
  };

  return {
    userId,
    /** Runs until interrupted. Fork it while this account is signed in. */
    run,
    /** The network or the app came back: pull and push now instead of after the backoff. */
    wake: () => signal?.("wake"),
    getStatus: () => status,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Starts syncing a signed-out device's tables, so one can be shared. */
    enable: async () => {
      await store.transform((state) =>
        state.sync ? state : { ...state, sync: { userId: null, synced: [], rejected: [] } },
      );
      signal?.("wake");
    },
    /** A new read-only link for a table this device started; any earlier link stops working. */
    share: (tableId: TableId) => sharing(tableId, transport.share),
    /** Stops the table's link working. */
    unshare: (tableId: TableId) => sharing(tableId, transport.unshare),
    /** The whole table as the server has it, for a table this device started or joined. */
    table: (tableId: TableId) => online((actor) => transport.table(tableId, actor)),
    /** A single-use link that lets another device record as `playerId`. */
    invitePlayer: (playerId: PlayerId) =>
      online((actor) => transport.invitePlayer(playerId, actor)),
    /** The open invite and the other devices recording as `playerId`. */
    playerAccess: (playerId: PlayerId) =>
      online((actor) => transport.playerAccess(playerId, actor)),
    revokeBinding: (playerId: PlayerId, actorId: ActorId) =>
      online((actor) => transport.revokeBinding(playerId, actorId, actor)),
    revokeInvite: (inviteId: PlayerInviteId) =>
      online((actor) => transport.revokeInvite(inviteId, actor)),
    /**
     * What the device's players and the people they've shared a table with owe each other, as
     * the server has it. Payments still on this device aren't in it.
     */
    balances: () => online((actor) => transport.balances(actor)),
    /** Everything between this device's player and `playerId`, as the server has it. */
    pair: (playerId: PlayerId) => online((actor) => transport.pair(playerId, actor)),
    /**
     * Records as the player a personal invite names, from now on. It needs the network once; the
     * next pull brings that player's tables and play.
     */
    redeem: async (token: string) => {
      await store.transform((state) =>
        state.sync ? state : { ...state, sync: { userId: null, synced: [], rejected: [] } },
      );
      const state = store.getSnapshot().state!;
      const actor = userId === null ? await actorCredential(keys, state.actor.id) : null;
      if (actor) await Effect.runPromise(transport.registerActor(actor));
      const player = await Effect.runPromise(
        transport.redeemInvite(
          token,
          { identity: { playerId: state.self.id, actorId: state.actor.id } },
          actor,
        ),
      );
      pull = true;
      signal?.("wake");
      return player;
    },
    /**
     * Joins a shared table as a new player named `displayName`, which needs the network once.
     * After that, the player's own play records on this device and syncs like any other.
     */
    join: async (token: string, displayName: string) => {
      const name = displayName.trim();
      if (name === "") throw new RecordingError("invalid", "Enter your name.");
      if (name.length > 60) throw new RecordingError("invalid", "Keep your name to 60 characters.");
      await store.transform((state) =>
        state.sync ? state : { ...state, sync: { userId: null, synced: [], rejected: [] } },
      );
      const state = store.getSnapshot().state!;
      const actor = userId === null ? await actorCredential(keys, state.actor.id) : null;
      if (actor) await Effect.runPromise(transport.registerActor(actor));
      const joined = await Effect.runPromise(
        transport.join(
          token,
          {
            identity: { playerId: state.self.id, actorId: state.actor.id },
            player: { id: PlayerId.make(newId()), displayName: name },
          },
          actor,
        ),
      );
      await store.transform((current) => addJoinedTable(current, joined));
      signal?.("wake");
      return joined;
    },
    discard: (operationId: RecordingOperationId) =>
      store.transform((state) => discardRejected(state, operationId)),
    recordAgain: async (operationId: RecordingOperationId) => {
      await store.transform((state) => recordRejectedAgain(state, operationId));
      signal?.("change");
    },
  };
};
export type RecordingSync = ReturnType<typeof makeRecordingSync>;

const isIdentityConflict = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "Conflict" &&
  "reason" in error &&
  error.reason === "recording_identity";
