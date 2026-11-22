export type NativeHeaderActionsOptions = {
  /** Adds a Groups button beside You. */
  onOpenGroups?: () => void;
  /** For a screen whose header is hidden or draws its own controls. */
  disabled?: boolean;
};

/** You, and on Crew Groups, in the native iOS navigation bar. Android draws its own header controls. */
export function useNativeHeaderActions(_options?: NativeHeaderActionsOptions) {
  return null;
}
