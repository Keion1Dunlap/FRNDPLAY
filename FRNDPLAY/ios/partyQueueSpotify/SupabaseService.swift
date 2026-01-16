import Foundation
import Supabase

@MainActor
final class SupabaseService: ObservableObject {
    let client: SupabaseClient

    @Published var accessToken: String? = nil
    @Published var authError: String? = nil

    init() {
        client = SupabaseClient(supabaseURL: Config.supabaseURL, supabaseKey: Config.supabaseAnonKey)
    }

    func restoreSession() async {
        do {
            let session = try await client.auth.session
            accessToken = session.accessToken
        } catch {
            accessToken = nil
        }
    }

    func signIn(email: String, password: String) async {
        authError = nil
        do {
            let session = try await client.auth.signIn(email: email, password: password)
            accessToken = session.accessToken
        } catch {
            authError = error.localizedDescription
        }
    }

    func signUp(email: String, password: String) async {
        authError = nil
        do {
            _ = try await client.auth.signUp(email: email, password: password)
            try? await restoreSession()
            if accessToken == nil {
                authError = "Check your email to confirm your account, then sign in."
            }
        } catch {
            authError = error.localizedDescription
        }
    }

    func signOut() async {
        try? await client.auth.signOut()
        accessToken = nil
    }
}
