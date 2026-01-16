import Foundation

struct SpotifyTrack: Identifiable, Decodable {
    let id: String
    let name: String
    let uri: String
    let artists: [Artist]

    struct Artist: Decodable { let name: String }
    var artistName: String { artists.first?.name ?? "" }
}

@MainActor
final class SpotifyWebAPI: ObservableObject {
    @Published var results: [SpotifyTrack] = []
    @Published var error: String? = nil

    func search(query: String, accessToken: String) async {
        error = nil
        results = []

        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return }

        let q = trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let url = URL(string: "https://api.spotify.com/v1/search?type=track&limit=25&q=\(q)")!

        var req = URLRequest(url: url)
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else {
                throw NSError(domain: "SpotifySearch", code: 1)
            }

            struct Response: Decodable {
                struct Tracks: Decodable { let items: [SpotifyTrack] }
                let tracks: Tracks
            }

            let decoded = try JSONDecoder().decode(Response.self, from: data)
            results = decoded.tracks.items
        } catch {
            self.error = "Search failed: \(error.localizedDescription)"
        }
    }
}
