import Contacts
import ContactsUI
import ExpoModulesCore
import UIKit

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

        let delegate = PickDelegate { [weak self] picked in
          self?.activePick = nil
          promise.resolve(picked)
        }
        self.activePick = delegate
        self.presentPicker(delegate, promise: promise, retries: ContactPickerModule.presentRetries)
      }
    }

    // Marks a folder as left out of iCloud and device backups. The photos in it can't be fetched
    // again, but they belong to this phone and never to a backup.
    Function("excludeFromBackup") { (uri: String) -> Bool in
      guard var url = URL(string: uri) else { return false }
      var values = URLResourceValues()
      values.isExcludedFromBackup = true

      do {
        try url.setResourceValues(values)
        return true
      } catch {
        return false
      }
    }
  }

  private static let presentRetries = 5

  // UIKit silently refuses to present over a busy or detached controller, and then neither
  // delegate method runs, so activePick would never clear. A native menu's action can arrive
  // while the menu is still dismissing, so a busy screen is retried briefly before giving up.
  private func presentPicker(_ delegate: PickDelegate, promise: Promise, retries: Int) {
    if let presenter = appContext?.utilities?.currentViewController(),
      presenter.viewIfLoaded?.window != nil,
      presenter.presentedViewController == nil,
      !presenter.isBeingDismissed,
      !presenter.isBeingPresented
    {
      let picker = CNContactPickerViewController()
      picker.delegate = delegate
      presenter.present(picker, animated: true)
      return
    }

    guard retries > 0 else {
      activePick = nil
      promise.reject("ERR_NO_VIEW_CONTROLLER", "There is no screen to show Contacts on.")
      return
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
      self?.presentPicker(delegate, promise: promise, retries: retries - 1)
    }
  }
}

private final class PickDelegate: NSObject, CNContactPickerDelegate {
  private var finish: (([String: Any]?) -> Void)?

  init(finish: @escaping ([String: Any]?) -> Void) {
    self.finish = finish
  }

  func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
    // The snapshot carries the name keys; an unfetched key would raise an Objective-C exception.
    let keys = [CNContactFormatter.descriptorForRequiredKeys(for: .fullName)]

    guard contact.areKeysAvailable(keys),
      let name = CNContactFormatter.string(from: contact, style: .fullName)
    else {
      complete(nil)
      return
    }

    complete(["name": name, "photo": PickedPhoto.read(from: contact)])
  }

  func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
    complete(nil)
  }

  private func complete(_ picked: [String: Any]?) {
    finish?(picked)
    finish = nil
  }
}

private enum PickedPhoto {
  static let side: CGFloat = 192
  static let folder = "contact-picks"

  /// `["uri": ...]`, "none" when the contact has no photo, or "unavailable" when the snapshot
  /// carries neither image key.
  static func read(from contact: CNContact) -> Any {
    let hasThumbnail = contact.isKeyAvailable(CNContactThumbnailImageDataKey)
    let hasImage = contact.isKeyAvailable(CNContactImageDataKey)

    guard hasThumbnail || hasImage else { return "unavailable" }

    let thumbnail = hasThumbnail ? contact.thumbnailImageData : nil
    let image = hasImage ? contact.imageData : nil

    guard let data = [thumbnail, image].compactMap({ $0 }).first(where: { !$0.isEmpty }) else {
      return "none"
    }

    guard let uri = writeSquare(data) else { return "unavailable" }

    return ["uri": uri]
  }

  // UIImage.draw honours the image's orientation, and size is already the upright size. The
  // renderer writes a JPEG with no EXIF.
  private static func writeSquare(_ data: Data) -> String? {
    guard let image = UIImage(data: data) else { return nil }

    let shortSide = min(image.size.width, image.size.height)

    guard shortSide > 0 else { return nil }

    let scale = side / shortSide
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true

    let jpeg = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
      .jpegData(withCompressionQuality: 0.85) { context in
        UIColor.white.setFill()
        context.fill(CGRect(x: 0, y: 0, width: side, height: side))
        image.draw(
          in: CGRect(
            x: -(image.size.width - shortSide) / 2 * scale,
            y: -(image.size.height - shortSide) / 2 * scale,
            width: image.size.width * scale,
            height: image.size.height * scale))
      }

    guard
      let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
    else { return nil }

    let directory = caches.appendingPathComponent(folder, isDirectory: true)
    let file = directory.appendingPathComponent("\(UUID().uuidString).jpg")

    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      try jpeg.write(to: file, options: .atomic)
      return file.absoluteString
    } catch {
      return nil
    }
  }
}
