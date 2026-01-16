import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    static var onOpenURL: ((URL) -> Void)?

    func application(_ app: UIApplication, open url: URL,
                     options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
        AppDelegate.onOpenURL?(url)
        return true
    }
}
