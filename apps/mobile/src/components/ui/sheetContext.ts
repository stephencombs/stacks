import { createContext, useState, type ReactNode } from "react";

export const InSheet = createContext(false);

export interface SheetRegistration {
  readonly id: number;
  readonly title: string;
  readonly description?: string;
  readonly footer?: ReactNode;
  readonly busy: boolean;
  readonly back: boolean;
  readonly large: boolean;
  readonly hideHeader: boolean;
  readonly floatingFooter: boolean;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}

const createSheetStore = () => {
  let active: SheetRegistration | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => active,
    claim: (slot: SheetRegistration) => {
      if (active === slot) return;
      active = slot;
      notify();
    },
    release: (id: number) => {
      if (active?.id !== id) return;
      active = null;
      notify();
    },
  };
};

export type SheetStore = ReturnType<typeof createSheetStore>;

export const SheetStoreContext = createContext<SheetStore | null>(null);

export const useCreateSheetStore = () => {
  const [store] = useState(createSheetStore);

  return store;
};
