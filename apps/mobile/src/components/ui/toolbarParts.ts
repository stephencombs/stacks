import type { SFSymbol } from "expo-symbols";
import type { ReactNode } from "react";

export type ToolbarPlacement = "left" | "right";

type ItemProps = {
  /** An SF Symbol name. */
  icon?: SFSymbol;
  accessibilityLabel?: string;
  /** Draws the item in its own glass capsule instead of sharing one with its neighbours. */
  separateBackground?: boolean;
  /** Matches the item across screens, so UIKit morphs it during a push or pop. */
  identifier?: string;
  disabled?: boolean;
};

export type ToolbarButtonProps = ItemProps & {
  label?: string;
  variant?: "plain" | "done" | "prominent";
  tintColor?: string;
  onPress: () => void;
};

export type ToolbarMenuProps = ItemProps & {
  /** The menu button's own text. */
  title: string;
  children?: ReactNode;
};

export type ToolbarMenuActionProps = {
  title: string;
  subtitle?: string;
  icon?: SFSymbol;
  isOn?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
};

export type ToolbarCustomProps = {
  /** Drops the shared glass platter, for a view that draws its own. */
  hidesSharedBackground?: boolean;
  children?: ReactNode;
};

export type ToolbarSpacerProps = { width: number };

/** Declarations the toolbar reads from its children; they draw nothing themselves. */
export const toolbarParts = {
  Button: (_props: ToolbarButtonProps) => null,
  Menu: (_props: ToolbarMenuProps) => null,
  MenuAction: (_props: ToolbarMenuActionProps) => null,
  Custom: (_props: ToolbarCustomProps) => null,
  Spacer: (_props: ToolbarSpacerProps) => null,
};
