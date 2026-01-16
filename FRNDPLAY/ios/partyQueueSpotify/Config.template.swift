import Foundation

enum Config {
    static let supabaseURL = URL(string: "https://YOURPROJECT.supabase.co")!
    static let supabaseAnonKey = "YOUR_SUPABASE_ANON_KEY"

    // Simulator: localhost OK. Real iPhone: use your Mac LAN IP.
    static let serverURL = URL(string: "http://localhost:4000")!

    static let spotifyClientID = "YOUR_SPOTIFY_CLIENT_ID"
    static let spotifyRedirectURI = URL(string: "partyqueue://spotify-login-callback")!
}
