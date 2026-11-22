import ExpoModulesCore

public class NativeSearchBarModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeSearchBar")

    View(NativeSearchBarView.self) {
      Events("onChangeText")

      Prop("text") { (view, text: String) in
        view.setText(text)
      }

      Prop("placeholder") { (view, placeholder: String) in
        view.setPlaceholder(placeholder)
      }
    }
  }
}
