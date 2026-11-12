# Mobile controls

Color Up keeps the same ledger meaning and destinations on web, iOS and Android. Each platform supplies its own controls. A pill-shaped React Native view does not replace the behavior of a native tab bar, picker or menu.

## Navigation

Keep React Navigation native-stack. iOS uses the native bottom tab navigator and SF Symbols; Android uses the standard bottom tab navigator with destination labels. The mobile web build keeps its floating capsule. Sessions, Board and Group remain peer destinations; a group with no trips offers only Group.

Use native iOS header items for Groups and You. Related items may share the system glass background. Keep the header transparent, with a centred native glass title capsule instead of a large body heading. The title expands into a popover with its full title and context; group destination titles open the group/trip selection sheet. Scope is never the back action.

The live-session return strip and bottom actions float above content without a full-width background or divider. Scroll content must reserve their measured height as well as the tab bar, so the final row remains reachable. Only the individual controls carry a surface.

## Selection and forms

Use Choice for an exclusive value. On native platforms it selects a system segmented control only when the labels fit; longer labels and larger collections use native menu pickers. Use presentation="menu" when the task needs a compact selection row regardless of option count. Participant inclusion is a checklist, not an exclusive picker.

Use DateTimeField for calendar dates and times. Keep an unset time visibly unset until the user confirms it. Display dates in the device locale while preserving local date/time semantics in the form's existing validation. A session may cross midnight.

TextField already uses a native text input. Give it the appropriate keyboard. Mixed name/money forms use the system keyboard; a custom amount keypad must hide while a text note is focused. Amount parsing remains in integer minor units.

## Menus and sheets

Use ActionMenu for short contextual choices, such as trip options. A destructive action opens a confirmation that names its consequence. If a correction needs a reason, retain the reason form rather than replacing it with a reasonless alert.

Sheet on iOS uses native form-sheet detents, a native grabber and native title/close chrome. Short content should open at an appropriate height; long forms can expand. Pass busy while saving to block both explicit close and native dismissal. Keep drafts and errors visible until a successful write.

Settings use native grouped form sections on iOS. A row that opens a page or editor gets a disclosure affordance; it should not look like a large submit button. Keep destructive actions in a separate section.

## Material and identity

Glass belongs to floating navigation, header actions and scope pills. GlassSurface uses native iOS material when available and a palette surface elsewhere. Keep ledger cards solid, and retain Color Up's gold primary action, chip identities and money typography. Let the OS choose the shape and selection treatment of native controls.

Keep app theme and native control appearance in sync. Verify Dynamic Type, VoiceOver, Reduce Transparency, keyboard dismissal, nested sheets and safe-area behavior on devices. A successful JavaScript export does not verify native layout or gestures.

## Charts and money

Custom charts remain appropriate. Explain what each bar measures; participation share must not look like a winnings comparison. Distinguish people with readable labels. Narrow chart bars need a generous alternative selection path and an accessible description of the selected session.

A result can come from adjustments without buy-ins or cash-outs. State that provenance rather than implying the visible in/out totals explain the result.

## Reference

T3 Code's [native controls](https://github.com/pingdotgg/t3code/tree/main/apps/mobile/modules/t3-native-controls), [header toolbar](https://github.com/pingdotgg/t3code/blob/main/apps/mobile/src/native/NativeHeaderToolbar.tsx) and [sheet](https://github.com/pingdotgg/t3code/blob/main/apps/mobile/src/components/ui/Sheet.tsx) demonstrate the platform behavior behind the reference screenshots. Its exact titleless tab capsule uses a local UIKit module; Color Up uses the installed native navigator instead of copying that module.
