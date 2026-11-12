# Claiming guest history

Signing up keeps a guest's identity and history. A claim **links** an existing player to the
account (`players.user_id`, plus a `player_actors` binding for the account's actor). It never
copies an entry or visit, so a player has one history before and after.

## Two paths that never cross

- A legacy group guest is claimed with its group's `claim_code` (`Guests.claim`), and only that.
  The code names a `players` row with a group; a table player has none.
- A table player is claimed through a device binding (`Recording.claimActor`) or by redeeming a
  personal invite or joining while signed in. A table player's invite is refused for a group
  player, so neither path can reach the other's players.

Names never link players. Two identities made apart become one account's only when ownership of
both is proven (a device secret, an invite, a sign-in) and the account asks to link them.

## What the rules protect

- The account has one personal player: `players_one_personal` covers players with a
  `recording_actor_id`. A claimed table player carries `user_id` without one, so an account can hold
  many table players but still one personal player, and `personalIdentity` looks only at that one.
- Authority follows bindings, not `user_id`. Claiming binds the account's actor to each claimed
  player, copying the device binding's `bound_via`, with the device as `invited_by_actor`. That's
  why a signed-up starter recovers a table from any device signed in to the account, and why
  revoking the device's binding also ends the account's.
- A claim lasts as long as the claiming account's actor stays bound: revoking the last such binding
  clears `user_id`, so the starter's removal of access can't leave the account looking at the player.
- An account that already has a personal player can't take a device's own player as a second one.
  Without `link` the claim is refused (`recording_identity`); with it, the device's player is
  linked beside the account's and the device keeps its actor and secret. Otherwise the device's
  actor becomes the account's, and any player another account claimed first is let go, not handed
  over.
- Players are locked before bindings are read, in the order a revoke or a redeem takes them, so a
  claim can't act on a binding a revoke just ended. Linking leaves an account's existing binding
  as it is, never brings back one the starter revoked, and respects the five-device cap.
- Migration 0018 gives players an account's actor already held to that account, unless actors of
  several accounts hold them: those stay unclaimed rather than guessed.
- A device's unsynced commands are re-signed by the account when it adopts an identity; what the
  server already holds, and every table player's ID, is left as it is.
