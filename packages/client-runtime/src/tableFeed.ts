import type { TableId } from "@stacks/contracts";
import type { TableView } from "@stacks/contracts/recordingCommands";

import type { RefreshTarget } from "./noticeRefresh.ts";

type Entry = {
  view: TableView | null | undefined;
  readonly listeners: Set<() => void>;
};

/**
 * One fetch of each table's server view, shared by every screen showing it: however many of them
 * subscribe, a refresh is one request. A table's view is kept only while someone shows it.
 */
export const createTableFeed = (load: (tableId: TableId) => Promise<TableView>) => {
  const entries = new Map<TableId, Entry>();
  const loading = new Map<TableId, Entry>();
  const watchers = new Map<TableId, Set<(waiting: boolean) => void>>();

  const announce = (tableId: TableId, waiting: boolean) => {
    for (const watcher of watchers.get(tableId) ?? []) watcher(waiting);
  };

  const refresh = (tableId: TableId) => {
    const entry = entries.get(tableId);

    if (!entry || loading.get(tableId) === entry) return;
    loading.set(tableId, entry);
    announce(tableId, true);

    const settle = (view: TableView | null) => {
      if (entries.get(tableId) === entry) {
        entry.view = view;

        for (const listener of entry.listeners) listener();
      }

      if (loading.get(tableId) === entry) {
        loading.delete(tableId);
        announce(tableId, false);
      }
    };

    load(tableId).then(settle, () => settle(null));
  };

  return {
    view: (tableId: TableId) => entries.get(tableId)?.view,
    subscribe: (tableId: TableId, listener: () => void) => {
      let entry = entries.get(tableId);

      if (!entry) {
        entry = { view: undefined, listeners: new Set() };
        entries.set(tableId, entry);
      }

      entry.listeners.add(listener);

      if (entry.listeners.size === 1) refresh(tableId);

      return () => {
        entry.listeners.delete(listener);

        if (entry.listeners.size === 0 && entries.get(tableId) === entry) entries.delete(tableId);
      };
    },
    refresh,
    watchLoading: (tableId: TableId, listener: (waiting: boolean) => void) => {
      const set = watchers.get(tableId) ?? new Set();
      watchers.set(tableId, set);
      set.add(listener);
      listener(loading.has(tableId));

      return () => {
        set.delete(listener);

        if (set.size === 0 && watchers.get(tableId) === set) watchers.delete(tableId);
      };
    },
  };
};

export type TableFeed = ReturnType<typeof createTableFeed>;

/** A change notice for a table: fetch its view once, and `wake` the device ledger to pull. */
export const tableRefreshTarget = (feed: TableFeed, tableId: TableId, wake: () => void) =>
  ({
    refresh: () => {
      feed.refresh(tableId);
      wake();
    },
    watchWaiting: (listener) => feed.watchLoading(tableId, listener),
  }) satisfies RefreshTarget;
