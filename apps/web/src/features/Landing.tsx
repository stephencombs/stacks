import { SignInButton, SignUpButton } from "@clerk/react";
import { sampleTrip } from "@stacks/client-runtime/sample";

import { Button } from "~/components/ui/Button";
import { TripHero } from "./TripHero";

const steps = [
  {
    title: "Log it at the table",
    body: "Buy-ins and cash-outs take a few taps, even mid-shoe. A rebuy repeats your last amount in one, and undo is right there if you fat-finger it.",
  },
  {
    title: "Watch the board",
    body: "Everyone's running total, session by session, with your line in gold. Win rate, best session and who's on a heater come for free.",
  },
  {
    title: "Settle up once",
    body: "Covered buy-ins and held chips turn into the fewest payments that square everyone, with links to pay however your group already does.",
  },
];

function Ctas() {
  return (
    <div className="flex flex-wrap gap-3">
      <SignUpButton mode="modal">
        <Button variant="primary" size="lg">
          Create an account
        </Button>
      </SignUpButton>
      <SignInButton mode="modal">
        <Button size="lg">Sign in</Button>
      </SignInButton>
    </div>
  );
}

/** What a signed-out visitor sees: the pitch, the app itself, and how a trip goes. */
export function Landing({ invited }: { invited: boolean }) {
  if (invited)
    return (
      <main className="flex w-full flex-1 flex-col justify-center gap-5 pb-24 lg:mx-auto lg:max-w-2xl">
        <h1 className="max-w-[14ch] font-display text-6xl leading-[0.9] tracking-[-0.01em] text-balance uppercase sm:text-7xl">
          You've been invited to a group.
        </h1>
        <p className="max-w-[46ch] text-lg text-pretty text-muted">
          Sign in or create an account to see who invited you and join their ledger.
        </p>
        <Ctas />
      </main>
    );

  return (
    <main className="flex w-full flex-1 flex-col gap-16 pt-10 pb-24 sm:pt-16 lg:mx-auto lg:max-w-2xl">
      <section className="flex flex-col gap-5">
        <h1 className="max-w-[14ch] font-display text-6xl leading-[0.9] tracking-[-0.01em] text-balance uppercase sm:text-7xl">
          Keep the casino trip honest.
        </h1>
        <p className="max-w-[46ch] text-lg text-pretty text-muted">
          Log buy-ins and cash-outs as you play. Color Up works out everyone's results and who owes
          whom. You pay each other however you like.
        </p>
        <Ctas />
      </section>

      <div
        role="img"
        aria-label="An example trip card: up $275 after three sessions and two nights, $400 up from your low, first on the board."
        className="pointer-events-none select-none"
      >
        <TripHero {...sampleTrip} />
      </div>

      <section aria-labelledby="how" className="flex flex-col gap-6">
        <h2 id="how" className="text-lg font-semibold">
          How a trip works
        </h2>
        <ol className="flex flex-col gap-6">
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="w-6 shrink-0 font-display text-3xl leading-none text-muted tabular-nums">
                {i + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-medium">{step.title}</h3>
                <p className="max-w-[52ch] text-pretty text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="ledger" className="flex flex-col gap-4 border-t border-line pt-10">
        <h2 id="ledger" className="text-lg font-semibold">
          A ledger, not a casino
        </h2>
        <p className="max-w-[52ch] text-pretty text-muted">
          Color Up never takes bets and never moves money. It keeps the record of what your group
          bought in and cashed out, so nobody has to remember at 3am who covered whom.
        </p>
        <Ctas />
      </section>
    </main>
  );
}
