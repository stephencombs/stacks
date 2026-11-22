import type {
  NativeStackHeaderItemButton,
  NativeStackHeaderItemCustom,
  NativeStackHeaderItemMenu,
  NativeStackHeaderItemMenuAction,
  NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import type { SFSymbol } from "expo-symbols";
import {
  Children,
  Fragment,
  isValidElement,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";

import { ScreenOptions } from "./ScreenOptions";
import type { ToolbarProps } from "./Toolbar";
import { toolbarParts, type ToolbarButtonProps, type ToolbarPlacement } from "./toolbarParts";

type Action = {
  id: string;
  title: string;
  subtitle?: string | undefined;
  icon?: SFSymbol | undefined;
  isOn?: boolean | undefined;
  disabled?: boolean | undefined;
  destructive?: boolean | undefined;
};

type Shared = {
  id: string;
  icon?: SFSymbol | undefined;
  accessibilityLabel?: string | undefined;
  separateBackground?: boolean | undefined;
  identifier?: string | undefined;
  disabled?: boolean | undefined;
};

type Described =
  | (Shared & {
      type: "button";
      label?: string | undefined;
      variant?: ToolbarButtonProps["variant"];
      tintColor?: string | undefined;
    })
  | (Shared & { type: "menu"; title: string; actions: Action[] })
  | { type: "custom"; id: string; hidesSharedBackground?: boolean | undefined }
  | { type: "spacing"; width: number };

function flatten(children: ReactNode) {
  const queue = Children.toArray(children);
  const elements: ReactElement[] = [];

  for (let child = queue.shift(); child !== undefined; child = queue.shift()) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;

    if (child.type === Fragment) queue.unshift(...Children.toArray(child.props.children));
    else elements.push(child);
  }

  return elements;
}

const isPart = <Props,>(
  element: ReactElement,
  part: (props: Props) => null,
): element is ReactElement<Props> => element.type === part;

function describe(children: ReactNode, placement: ToolbarPlacement) {
  const handlers = new Map<string, () => void>();
  const nodes = new Map<string, ReactNode>();
  const items: Described[] = [];

  for (const [index, element] of flatten(children).entries()) {
    const id = `${placement}-${index}`;

    if (isPart(element, toolbarParts.Button)) {
      const props = element.props;
      handlers.set(id, props.onPress);
      items.push({
        type: "button",
        id,
        label: props.label,
        icon: props.icon,
        accessibilityLabel: props.accessibilityLabel,
        separateBackground: props.separateBackground,
        identifier: props.identifier,
        disabled: props.disabled,
        variant: props.variant,
        tintColor: props.tintColor,
      });
    } else if (isPart(element, toolbarParts.Menu)) {
      const props = element.props;
      const actions: Action[] = [];

      for (const [actionIndex, action] of flatten(props.children).entries()) {
        if (!isPart(action, toolbarParts.MenuAction)) continue;
        const actionProps = action.props;
        const actionId = `${id}-${actionIndex}`;
        handlers.set(actionId, actionProps.onPress);
        actions.push({
          id: actionId,
          title: actionProps.title,
          subtitle: actionProps.subtitle,
          icon: actionProps.icon,
          isOn: actionProps.isOn,
          disabled: actionProps.disabled,
          destructive: actionProps.destructive,
        });
      }

      items.push({
        type: "menu",
        id,
        title: props.title,
        icon: props.icon,
        accessibilityLabel: props.accessibilityLabel,
        separateBackground: props.separateBackground,
        identifier: props.identifier,
        disabled: props.disabled,
        actions,
      });
    } else if (isPart(element, toolbarParts.Custom)) {
      const props = element.props;
      nodes.set(id, props.children);
      items.push({ type: "custom", id, hidesSharedBackground: props.hidesSharedBackground });
    } else if (isPart(element, toolbarParts.Spacer)) {
      items.push({ type: "spacing", width: element.props.width });
    }
  }

  return { items, handlers, nodes };
}

type Committed = ReturnType<typeof makeCommitted>;

function makeCommitted() {
  const listeners = new Set<() => void>();

  return {
    handlers: new Map<string, () => void>(),
    nodes: new Map<string, ReactNode>(),
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    publish: () => {
      for (const listener of listeners) listener();
    },
  };
}

function CommittedView({ committed, id }: { committed: Committed; id: string }) {
  const node = useSyncExternalStore(committed.subscribe, () => committed.nodes.get(id));

  return <>{node}</>;
}

const symbol = (name: SFSymbol | undefined) =>
  name === undefined ? undefined : ({ type: "sfSymbol", name } as const);

function nativeItems(items: Described[], placement: ToolbarPlacement, committed: Committed) {
  const press = (id: string) => () => committed.handlers.get(id)?.();

  return items.map((item, position) => {
    switch (item.type) {
      case "button":
        return {
          type: "button",
          label: item.label ?? item.accessibilityLabel ?? "",
          icon: symbol(item.icon),
          accessibilityLabel: item.accessibilityLabel,
          sharesBackground: item.separateBackground ? false : undefined,
          identifier: item.identifier,
          disabled: item.disabled,
          variant: item.variant,
          tintColor: item.tintColor,
          onPress: press(item.id),
        } satisfies NativeStackHeaderItemButton;
      case "menu":
        return {
          type: "menu",
          label: item.title,
          icon: symbol(item.icon),
          accessibilityLabel: item.accessibilityLabel,
          sharesBackground: item.separateBackground ? false : undefined,
          identifier: item.identifier,
          disabled: item.disabled,
          menu: {
            items: item.actions.map(
              (action) =>
                ({
                  type: "action",
                  label: action.title,
                  description: action.subtitle,
                  icon: symbol(action.icon),
                  state: action.isOn ? "on" : "off",
                  disabled: action.disabled,
                  destructive: action.destructive,
                  onPress: press(action.id),
                }) satisfies NativeStackHeaderItemMenuAction,
            ),
          },
        } satisfies NativeStackHeaderItemMenu;
      case "custom":
        return {
          type: "custom",
          element: <CommittedView committed={committed} id={item.id} />,
          hidesSharedBackground: item.hidesSharedBackground,
        } satisfies NativeStackHeaderItemCustom;
      case "spacing":
        // WARNING: native-stack gives a spacer no index and reverses right items before indexing the rest.
        return {
          type: "spacing" as const,
          spacing: item.width,
          index: placement === "right" ? items.length - 1 - position : position,
        };
    }
  });
}

const optionKey = {
  left: "unstable_headerLeftItems",
  right: "unstable_headerRightItems",
} as const;

function ToolbarRoot({ placement, children }: ToolbarProps) {
  const navigation = useNavigation();
  const committed = useRef(makeCommitted()).current;
  const { items, handlers, nodes } = describe(children, placement);
  const key = optionKey[placement];

  useLayoutEffect(() => {
    committed.handlers = handlers;
    committed.nodes = nodes;
    committed.publish();
  });

  useLayoutEffect(
    () => () => {
      navigation.setOptions({ [key]: () => [] } satisfies NativeStackNavigationOptions);
    },
    [navigation, key],
  );

  return (
    <ScreenOptions
      options={{ [key]: () => nativeItems(items, placement, committed) }}
      optionsVersion={JSON.stringify(items)}
    />
  );
}

/**
 * Items in the native iOS navigation bar, declared where the screen is. Items run left to right
 * as written. The bar keeps one set of native items however often the screen re-renders: presses
 * and custom views read the latest render, and the items are only set again when their shape
 * changes. Leaving the screen clears the placement.
 */
export const Toolbar = Object.assign(ToolbarRoot, toolbarParts);
