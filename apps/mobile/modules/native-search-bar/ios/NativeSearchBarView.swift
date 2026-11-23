import ExpoModulesCore
import UIKit

public final class NativeSearchBarView: ExpoView, UISearchBarDelegate {
  private let searchBar = UISearchBar()
  let onChangeText = EventDispatcher()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    searchBar.delegate = self
    searchBar.searchBarStyle = .minimal
    searchBar.showsCancelButton = false
    searchBar.autocapitalizationType = .none
    searchBar.autocorrectionType = .no
    searchBar.spellCheckingType = .no
    searchBar.returnKeyType = .search
    searchBar.enablesReturnKeyAutomatically = false
    // The field draws no capsule of its own: the glass behind this view is the bar.
    searchBar.setSearchFieldBackgroundImage(UIImage(), for: .normal)
    searchBar.searchTextField.clearButtonMode = .always
    addSubview(searchBar)
  }

  override public func layoutSubviews() {
    super.layoutSubviews()
    searchBar.frame = bounds
  }

  func setText(_ text: String) {
    guard searchBar.text != text else { return }
    searchBar.text = text
  }

  func setPlaceholder(_ placeholder: String) {
    searchBar.placeholder = placeholder
  }

  public func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
    onChangeText(["text": searchText])
  }

  public func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
    searchBar.resignFirstResponder()
  }
}
