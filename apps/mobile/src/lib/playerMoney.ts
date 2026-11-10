import type { PairHistory, PlayerBalances, PlayerId } from "@stacks/contracts";
import type { ActorCredential } from "@stacks/contracts/recordingCommands";
import { describeError } from "@stacks/client-runtime/errors";
import * as Effect from "effect/Effect";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { useAccount } from "./account";
import { actorKeys } from "./actorKeys";
import { recordingStore } from "./recording";
import { connectRecording } from "./stacks";

/** The device ledger, for the payments and table players only it holds. */
export const useRecordingState = () =>
  useSyncExternalStore(recordingStore.subscribe, recordingStore.getSnapshot).state;

/**
 * Proves this device to the API the way sync does: the account's session when signed in, or the
 * device actor's saved key. A device that never synced has no key, so it has nobody to owe.
 */
const credential = async (signedIn: boolean): Promise<{ actor: Actor } | null> => {
  if (signedIn) return { actor: null };
  const state = recordingStore.getSnapshot().state;
  const saved = await actorKeys.load();
  return saved && state && saved.actorId === state.actor.id ? { actor: saved } : null;
};

type Remote<A> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: string }
  | { readonly status: "ready"; readonly value: A };

type Actor = ActorCredential | null;

/** Reads one server view of money between players; `reload` fetches it again. */
function useRemote<A, K extends string>(
  read: (actor: Actor, key: K) => Effect.Effect<A, unknown>,
  empty: A,
  key: K,
) {
  const account = useAccount();
  const signedIn = Boolean(account.available && account.isSignedIn);
  const [round, setRound] = useState(0);
  const request = `${signedIn}:${key}:${round}`;
  const [held, setHeld] = useState<{ request: string; result: Remote<A> } | null>(null);
  useEffect(() => {
    let current = true;
    const settle = (result: Remote<A>) => current && setHeld({ request, result });
    credential(signedIn)
      .then((proof) => (proof === null ? empty : Effect.runPromise(read(proof.actor, key))))
      .then(
        (value) => settle({ status: "ready", value }),
        (cause) => settle({ status: "error", error: describeError(cause) }),
      );
    return () => {
      current = false;
    };
  }, [request, signedIn, read, empty, key]);
  const result: Remote<A> = held?.request === request ? held.result : { status: "loading" };
  return { result, reload: useCallback(() => setRound((n) => n + 1), []) };
}

const noBalances: PlayerBalances = { pairs: [] };
const readBalances = (actor: Actor) => connectRecording().balances(actor);
const readPair = (actor: Actor, playerId: PlayerId) => connectRecording().pair(playerId, actor);

export const useBalances = () => useRemote(readBalances, noBalances, "balances");

export const usePair = (playerId: PlayerId) =>
  useRemote<PairHistory | null, PlayerId>(readPair, null, playerId);
