import Contacts
import ContactsUI
import ExpoModulesCore

public class ContactPickerModule: Module {
  // CNContactPickerViewController holds its delegate weakly.
  private var activePick: PickDelegate?

  public func definition() -> ModuleDefinition {
    Name("ContactPicker")

    AsyncFunction("pickContact") { (promise: Promise) in
      DispatchQueue.main.async { [weak self] in
        guard let self else {
          promise.resolve(nil)
          return
        }

        guard self.activePick == nil else {
          promise.reject("ERR_PICK_IN_PROGRESS", "A contact is already being picked.")
          return
        }

        guard let presenter = self.appContext?.utilities?.currentViewController() else {
          promise.reject("ERR_NO_VIEW_CONTROLLER", "There is no screen to show Contacts on.")
          return
        }

        let delegate = PickDelegate { [weak self] name in
          self?.activePick = nil
          promise.resolve(name)
        }
        let picker = CNContactPickerViewController()
        picker.delegate = delegate
        self.activePick = delegate
        presenter.present(picker, animated: true)
      }
    }
  }
}

private final class PickDelegate: NSObject, CNContactPickerDelegate {
  private var finish: ((String?) -> Void)?

  init(finish: @escaping (String?) -> Void) {
    self.finish = finish
  }

  func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
    // The snapshot carries the name keys; an unfetched key would raise an Objective-C exception.
    let keys = [CNContactFormatter.descriptorForRequiredKeys(for: .fullName)]
    let name = contact.areKeysAvailable(keys)
      ? CNContactFormatter.string(from: contact, style: .fullName)
      : nil
    complete(name)
  }

  func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
    complete(nil)
  }

  private func complete(_ name: String?) {
    finish?(name)
    finish = nil
  }
}
