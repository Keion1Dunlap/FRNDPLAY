import Foundation

/// Fill in these values for your own Supabase + Spotify dev setup.
///
/// IMPORTANT:
/// - Never commit real keys/tokens to a public repo.
/// - The Supabase anon/publishable key is safe to embed in the iOS app.
/// - The Supabase service role key must stay on the server (.env only).

enum Config {
    // Supabase
    static let supabaseURL = URL(string: "https://YOURPROJECT.supabase.co")!
    static let supabaseAnonKey = "YOUR_SUPABASE_ANON_KEY"

    // Backend server
    // Simulator: localhost OK.
    // Real iPhone: use your computer's LAN IP (example: http://192.168.1.23:4000)
    static let serverURL = URL(string: "http://localhost:4000")!

    // Spotify (Web API)
    static let spotifyClientID = "YOUR_SPOTIFY_CLIENT_ID"
    static let spotifyRedirectURI = URL(string: "partyqueue://spotify-login-callback")!
}
