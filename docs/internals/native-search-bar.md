# Native bottom search bar

Pickers with a search (casinos, trips) use `SearchablePickerSheet`: a full-height `Sheet` with the search bar pinned above the keyboard and a `PickerRowsSkeleton` that has the real rows' geometry. iOS draws the bar with `modules/native-search-bar`, a `UISearchBar` view on a glass capsule, so the clear button and text editing are the system's. Android draws a Material bar in React Native.

The module is local, and needs a new dev build, because neither stock option places a bottom search bar from this app's stack. Both were judged from the installed sources, not tried on a device:

- `react-native-screens` `SearchBar` sets `UINavigationItem.searchController`. UIKit integrates an `integrated` search bar into the bottom toolbar of a navigation controller, and the library's stack builds its controller with no toolbar and never shows one, so the bar would stay in the top navigation bar.
- `@expo/ui` `searchable` has no `DefaultToolbarItem(kind: .search, placement: .bottomBar)`, the SwiftUI way to put search at the bottom of a `NavigationStack`, and would put the sheet's React Native rows inside a SwiftUI stack.

Revisit this when either library exposes a bottom search placement. Until then, don't swap the module for a React Native `TextInput` in glass: it loses the system clear button and text behavior.
