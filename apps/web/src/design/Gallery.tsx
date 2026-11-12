import { CurrencyCode, MinorUnits } from "@stacks/contracts";
import { themeChoices } from "@stacks/client-runtime/theme";
import { Layers, Moon, Plus, Sun, Trash2, TrendingUp, Users } from "lucide-react";
import { useState } from "react";

import { BalanceLabel, Money } from "~/components/Money";
import { CopyButton } from "~/components/CopyButton";
import { Button, ButtonLink } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Checkbox } from "~/components/ui/Checkbox";
import { Field, FormError, Input, RadioCards, Select } from "~/components/ui/Field";
import { Menu, MenuChoice, MenuItem } from "~/components/ui/Menu";
import { BackLink, PlaceLink, ScopeButton } from "~/components/ui/Nav";
import { EmptyState, Note, PageHeader, Section } from "~/components/ui/Page";
import { Segmented } from "~/components/ui/Segmented";
import { List, Row, RowLink, RowText, Skeleton, Surface, Tag } from "~/components/ui/Surface";
import { cn } from "~/components/ui/cn";
import { Chip } from "~/features/Chip";
import { setTheme, useTheme } from "~/lib/theme";

const usd = CurrencyCode.make("USD");
const cents = (dollars: number) => MinorUnits.make(dollars * 100);

const variants = ["primary", "tint", "secondary", "ghost", "danger"] as const;
const sizes = ["sm", "md", "lg"] as const;
const surfaces = [
  ["canvas", "bg-canvas"],
  ["surface", "bg-surface"],
  ["sunken", "bg-sunken"],
  ["fill", "bg-fill"],
  ["raised", "bg-raised"],
];
const inks = [
  ["ink", "text-ink"],
  ["muted", "text-muted"],
  ["faint", "text-faint"],
  ["accent-text", "text-accent-text"],
  ["win", "text-win"],
  ["loss", "text-loss"],
  ["live", "text-live"],
  ["danger", "text-danger"],
];
const roles = [
  ["type-title", "Vegas weekend"],
  ["type-callout", "Section heading"],
];
const places = [
  { label: "Sessions", icon: Layers },
  { label: "Board", icon: TrendingUp },
  { label: "Group", icon: Users },
];
const players = [
  { chip: 1, name: "Stephen", you: true, in: 400, out: 1125 },
  { chip: 2, name: "Maya", you: false, in: 600, out: 310 },
  { chip: 6, name: "Dev", you: false, in: 200, out: 200 },
];

function ThemeMenu() {
  const theme = useTheme();
  const Icon = theme === "light" ? Sun : Moon;
  return (
    <Menu label="Theme" icon={<Icon className="size-5" aria-hidden />}>
      <MenuChoice options={themeChoices} value={theme} onChange={setTheme} />
    </Menu>
  );
}

/** The shared web parts and their states, on the real tokens: the place to judge a change to the system. */
export function Gallery() {
  const [dialog, setDialog] = useState(false);
  const [view, setView] = useState("trip");
  const [kind, setKind] = useState("casino");
  const [highLimit, setHighLimit] = useState(true);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 py-8">
      <PageHeader
        back={<BackLink to="/">Back link</BackLink>}
        options={<ThemeMenu />}
        title="Design system"
        context="Page title, with the line saying where the page sits"
      />

      <Section title="Color">
        <Surface className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-5 gap-2">
            {surfaces.map(([name, background]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <div className={cn("h-14 rounded-lg shadow-(--elevation-control)", background)} />
                <span className="truncate font-mono text-xs text-muted">{name}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            {inks.map(([name, color]) => (
              <span key={name} className={cn("text-sm", color)}>
                {name}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((chip) => (
              <Chip key={chip} chip={chip} name={`${chip}`} size={32} />
            ))}
          </div>
        </Surface>
      </Section>

      <Section title="Type">
        <Surface className="flex flex-col gap-3 p-4">
          {roles.map(([role, sample]) => (
            <div key={role} className="flex items-baseline justify-between gap-4">
              <span className={role}>{sample}</span>
              <span className="font-mono text-xs text-muted">{role}</span>
            </div>
          ))}
        </Surface>
      </Section>

      <Section title="Buttons">
        <Surface className="flex flex-col gap-4 p-4">
          {variants.map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-3">
              {sizes.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {variant} {size}
                </Button>
              ))}
              <Button variant={variant} disabled>
                Disabled
              </Button>
              <Button variant={variant} pending>
                Pending
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">
              <Plus className="size-4" aria-hidden />
              With icon
            </Button>
            <Button variant="danger">
              <Trash2 className="size-4" aria-hidden />
              Void entry
            </Button>
            <Button onClick={() => setDialog(true)}>Open dialog</Button>
            <ButtonLink to="/">Button link</ButtonLink>
            <CopyButton text="https://stacks.example/join/abc" />
            <Menu label="More">
              <MenuItem onClick={() => undefined}>Edit trip</MenuItem>
              <MenuItem tone="danger" onClick={() => undefined}>
                Delete trip
              </MenuItem>
            </Menu>
          </div>
        </Surface>
      </Section>

      <Section title="Fields">
        <Surface className="flex flex-col gap-4 p-4">
          <Field label="Amount" hint="Whole dollars or cents.">
            {(props) => <Input {...props} defaultValue="400.00" inputMode="decimal" />}
          </Field>
          <Field label="Note">
            {(props) => <Input {...props} placeholder="Placeholder text" />}
          </Field>
          <Field label="Cash-out" error="A cash-out can't be negative. Enter 0 or more.">
            {(props) => <Input {...props} defaultValue="-20" />}
          </Field>
          <Field label="Game">
            {(props) => (
              <Select {...props} defaultValue="poker">
                <option value="poker">Poker</option>
                <option value="blackjack">Blackjack</option>
              </Select>
            )}
          </Field>
          <RadioCards
            label="Kind"
            options={[
              { value: "casino", label: "Casino" },
              { value: "online", label: "Online" },
              { value: "home", label: "Home game" },
            ]}
            value={kind}
            onChange={setKind}
          />
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <Checkbox checked={highLimit} onCheckedChange={setHighLimit} />
            High-limit table
          </label>
          <Field label="Disabled">{(props) => <Input {...props} disabled value="Locked" />}</Field>
          <FormError>Couldn't save that. Check your connection and try again.</FormError>
        </Surface>
      </Section>

      <Section title="Navigation">
        <Surface className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <ScopeButton context="Thursday crew" label="Vegas weekend" />
            <ScopeButton label="Thursday crew" />
          </div>
          <Note>
            The scope button: the trip in scope under its group, or a group with no trips yet.
          </Note>
          <div className="flex overflow-hidden rounded-lg bg-surface shadow-(--elevation-card)">
            {places.map((place, i) => (
              <PlaceLink
                key={place.label}
                to="/"
                icon={<place.icon className="size-5" aria-hidden />}
                label={place.label}
                current={i === 1}
                layout="bar"
              />
            ))}
          </div>
          <div className="flex w-60 flex-col gap-0.5 rounded-lg bg-canvas p-3">
            {places.map((place, i) => (
              <PlaceLink
                key={place.label}
                to="/"
                icon={<place.icon className="size-5" aria-hidden />}
                label={place.label}
                current={i === 1}
                layout="side"
              />
            ))}
          </div>
          <Note>The four places: the bottom bar on narrow screens, the sidebar on wide ones.</Note>
          <Segmented
            label="Board scope"
            options={[
              { value: "trip", label: "This trip" },
              { value: "all", label: "All time" },
            ]}
            value={view}
            onChange={setView}
          />
          <Note>A place's scope: the same data, wider.</Note>
        </Surface>
      </Section>

      <Section title="A session">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="live">Live</Tag>
          <Tag>Closed</Tag>
        </div>
        <List>
          {players.map((player) => (
            <Row key={player.name}>
              <Chip chip={player.chip} name={player.name} size={28} />
              <RowText
                title={player.name}
                meta={
                  <>
                    In <Money amount={cents(player.in)} currency={usd} /> · Out{" "}
                    <Money amount={cents(player.out)} currency={usd} />
                  </>
                }
              />
              <Money
                amount={cents(player.out - player.in)}
                currency={usd}
                tone="result"
                className="font-semibold"
              />
            </Row>
          ))}
          <RowLink to="/">
            <RowText title="A row that goes somewhere" meta="RowLink" />
          </RowLink>
        </List>
        <p className="flex flex-col gap-1 text-sm">
          <BalanceLabel amount={cents(725)} currency={usd} subject="you" />
          <BalanceLabel amount={cents(-290)} currency={usd} />
          <BalanceLabel amount={cents(0)} currency={usd} />
        </p>
      </Section>

      <Section title="States">
        <Surface className="flex flex-col gap-4 p-4">
          <EmptyState title="No sessions on this trip yet">
            Start one when you sit down, and everyone at the table can log their buy-ins.
          </EmptyState>
          <Note>A note: supporting text, quieter than the content around it.</Note>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-14" />
          </div>
        </Surface>
      </Section>

      <Dialog
        open={dialog}
        onOpenChange={setDialog}
        title="Void this entry?"
        description="The entry stays in the history, crossed out, and stops counting."
      >
        <div className="flex justify-end gap-2">
          <Button onClick={() => setDialog(false)}>Keep it</Button>
          <Button variant="danger" onClick={() => setDialog(false)}>
            Void entry
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
