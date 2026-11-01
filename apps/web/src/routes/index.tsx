import { useUser } from "@clerk/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CurrencyCode, GroupId } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { ChevronRight, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { BalanceLabel } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input, Select } from "~/components/ui/Field";
import { EmptyState, Skeleton, Surface, Tag } from "~/components/ui/Surface";
import { Loaded, useAction, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/")({ component: Groups });

function Groups() {
  const stacks = useStacks();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="flex items-end justify-between gap-4 pt-4">
        <h1 className="font-serif text-4xl font-medium">Your groups</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          New group
        </Button>
      </div>
      <Loaded query={stacks.groups} skeleton={<Skeleton className="h-40" />}>
        {(groups) =>
          groups.length === 0 ? (
            <EmptyState
              title="Start a group for the people you play with"
              action={
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Create a group
                </Button>
              }
            >
              A group keeps one shared ledger. If a friend already made one, open the invite link
              they sent you to join it.
            </EmptyState>
          ) : (
            <Surface className="divide-y divide-line">
              {groups.map((item) => (
                <Link
                  key={item.group.id}
                  to="/groups/$groupId"
                  params={{ groupId: item.group.id }}
                  className="flex items-center gap-4 px-5 py-4 transition-colors duration-150 first:rounded-t-2xl last:rounded-b-2xl hover:bg-sunken"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-serif text-xl">{item.group.name}</span>
                      {item.liveSessionCount > 0 ? <Tag tone="live">Live</Tag> : null}
                    </div>
                    <span className="text-sm">
                      <BalanceLabel
                        amount={item.myBalance}
                        currency={item.group.currency}
                        subject="you"
                      />
                    </span>
                  </div>
                  <ChevronRight className="size-5 text-faint" aria-hidden />
                </Link>
              ))}
            </Surface>
          )
        }
      </Loaded>
      <CreateGroupDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "MXN", "JPY"] as const;

function CreateGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stacks = useStacks();
  const navigate = useNavigate();
  const { user } = useUser();
  const create = useAction(stacks.Client.mutation("groups", "create"));
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const displayName = String(form.get("displayName")).trim();
    if (!name) return setNameError("Give the group a name.");
    setNameError(null);
    const detail = await create.run({
      payload: {
        id: GroupId.make(newId()),
        name,
        currency: CurrencyCode.make(String(form.get("currency"))),
        displayName: displayName || "Me",
      },
    });
    if (detail) {
      onOpenChange(false);
      void navigate({ to: "/groups/$groupId", params: { groupId: detail.group.id } });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New group"
      description="Everyone in a group shares one ledger in one currency."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Group name" error={nameError}>
          {(props) => (
            <Input
              {...props}
              name="name"
              placeholder="Vegas crew"
              autoComplete="off"
              maxLength={80}
            />
          )}
        </Field>
        <Field label="Your name in this group">
          {(props) => (
            <Input
              {...props}
              name="displayName"
              defaultValue={user?.firstName ?? ""}
              maxLength={60}
              autoComplete="given-name"
            />
          )}
        </Field>
        <Field label="Currency" hint="Can't be changed later.">
          {(props) => (
            <Select {...props} name="currency" defaultValue="USD">
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {create.error ? <FormError>{create.error}</FormError> : null}
        <Button type="submit" variant="primary" size="lg" disabled={create.pending}>
          {create.pending ? "Creating…" : "Create group"}
        </Button>
      </form>
    </Dialog>
  );
}
