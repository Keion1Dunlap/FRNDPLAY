import Foundation
import UIKit
import SpotifyiOS

@MainActor
final class SpotifyService: NSObject, ObservableObject {
    @Published var connected: Bool = false
    @Published var error: String? = nil
    @Published var accessToken: String? = nil

    private lazy var configuration: SPTConfiguration = {
        SPTConfiguration(clientID: Config.spotifyClientID, redirectURL: Config.spotifyRedirectURI)
    }()

    private lazy var sessionManager: SPTSessionManager = {
        SPTSessionManager(configuration: configuration, delegate: self)
    }()

    private lazy var appRemote: SPTAppRemote = {
        let remote = SPTAppRemote(configuration: configuration, logLevel: .debug)
        remote.delegate = self
        return remote
    }()

    func startLogin(from viewController: UIViewController) {
        let scopes: SPTScope = [.appRemoteControl]
        sessionManager.initiateSession(with: scopes, options: .default, presenting: viewController)
    }

    func handleRedirectURL(_ url: URL) {
        sessionManager.application(UIApplication.shared, open: url, options: [:])
    }

    private func connectRemote() {
        guard let token = accessToken else { return }
        appRemote.connectionParameters.accessToken = token
        appRemote.connect()
    }

    func play(uri: String) {
        appRemote.playerAPI?.play(uri, callback: { [weak self] _, err in
            if let err = err { self?.error = err.localizedDescription }
        })
    }

    func pause() { appRemote.playerAPI?.pause(nil) }
    func resume() { appRemote.playerAPI?.resume(nil) }
}

extension SpotifyService: SPTSessionManagerDelegate {
    func sessionManager(_ manager: SPTSessionManager, didInitiate session: SPTSession) {
        DispatchQueue.main.async {
            self.accessToken = session.accessToken
            self.connectRemote()
        }
    }
    func sessionManager(_ manager: SPTSessionManager, didFailWith error: Error) {
        DispatchQueue.main.async { self.error = error.localizedDescription }
    }
}

extension SpotifyService: SPTAppRemoteDelegate {
    func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
        DispatchQueue.main.async { self.connected = true }
    }
    func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
        DispatchQueue.main.async {
            self.connected = false
            self.error = error?.localizedDescription
        }
    }
    func appRemote(_ appRemote: SPTAppRemote, didFailConnectionAttemptWithError error: Error?) {
        DispatchQueue.main.async {
            self.connected = false
            self.error = error?.localizedDescription
        }
    }
}
