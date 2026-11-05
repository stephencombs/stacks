import UIKit

private var previousStartupExceptionHandler: NSUncaughtExceptionHandler?
private var startupCrashURL: URL?
private var startupCrashVersion = ""

// Keep the exception reason locally: Apple's .ips export can omit it entirely.
private func captureStartupException(_ exception: NSException) {
  if let url = startupCrashURL {
    let report = "Color Up \(startupCrashVersion)\n\(exception.name.rawValue)\n\(exception.reason ?? "No exception reason")\n\n\(exception.callStackSymbols.joined(separator: "\n"))"
    try? String(report.prefix(65536)).write(to: url, atomically: true, encoding: .utf8)
  }
  previousStartupExceptionHandler?(exception)
}

enum StartupCrashRecovery {
  static func install() {
#if !DEBUG
    startupCrashURL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
      .appendingPathComponent("colorup-native-exception.txt")
    let info = Bundle.main.infoDictionary ?? [:]
    startupCrashVersion = "\(info["CFBundleShortVersionString"] ?? "?") (\(info["CFBundleVersion"] ?? "?"))"
    previousStartupExceptionHandler = NSGetUncaughtExceptionHandler()
    NSSetUncaughtExceptionHandler(captureStartupException)
#endif
  }

  @MainActor
  static func show(in scene: UIScene, retry: @escaping () -> Void) -> UIWindow? {
    guard let url = startupCrashURL,
      let report = try? String(contentsOf: url, encoding: .utf8),
      let windowScene = scene as? UIWindowScene else { return nil }
    let window = UIWindow(windowScene: windowScene)
    let controller = StartupCrashViewController(report: report) { [weak window] in
      do {
        try FileManager.default.removeItem(at: url)
        window?.isHidden = true
        window?.rootViewController = nil
        retry()
      } catch {
        let alert = UIAlertController(title: "Couldn't clear the report", message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        window?.rootViewController?.present(alert, animated: true)
      }
    }
    window.rootViewController = controller
    window.makeKeyAndVisible()
    return window
  }
}

@MainActor
private final class StartupCrashViewController: UIViewController {
  private let report: String
  private let retry: () -> Void

  init(report: String, retry: @escaping () -> Void) {
    self.report = report
    self.retry = retry
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    let title = UILabel()
    title.text = "Color Up couldn't start"
    title.font = .preferredFont(forTextStyle: .title2)
    title.adjustsFontForContentSizeCategory = true
    title.numberOfLines = 0
    title.accessibilityTraits = .header
    let description = UILabel()
    description.text = "Share this report so we can investigate. It stays on your phone until you share it."
    description.font = .preferredFont(forTextStyle: .body)
    description.adjustsFontForContentSizeCategory = true
    description.numberOfLines = 0
    let details = UITextView()
    details.text = report
    details.isEditable = false
    details.font = .preferredFont(forTextStyle: .footnote)
    details.adjustsFontForContentSizeCategory = true
    let share = UIButton(type: .system)
    share.setTitle("Share report", for: .normal)
    share.addTarget(self, action: #selector(shareReport), for: .touchUpInside)
    let again = UIButton(type: .system)
    again.setTitle("Try again", for: .normal)
    again.addTarget(self, action: #selector(tryAgain), for: .touchUpInside)
    let stack = UIStackView(arrangedSubviews: [title, description, details, share, again])
    stack.axis = .vertical
    stack.spacing = 16
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
      stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
      share.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
      again.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
    ])
  }

  @objc private func shareReport(_ sender: UIButton) {
    let sheet = UIActivityViewController(activityItems: [report], applicationActivities: nil)
    sheet.popoverPresentationController?.sourceView = sender
    sheet.popoverPresentationController?.sourceRect = sender.bounds
    present(sheet, animated: true)
  }

  @objc private func tryAgain() { retry() }
}
