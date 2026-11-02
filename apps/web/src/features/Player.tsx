/** A player's name, with what marks them out: that it's you, or that they haven't signed up. */
export function PlayerName({
  name,
  you = false,
  guest = false,
}: {
  name: string;
  you?: boolean;
  guest?: boolean;
}) {
  return (
    <>
      {name}
      {you ? <span className="font-normal text-muted"> · you</span> : null}
      {guest ? <span className="font-normal text-muted"> · guest</span> : null}
    </>
  );
}
