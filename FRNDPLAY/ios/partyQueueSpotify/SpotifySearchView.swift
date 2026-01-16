import SwiftUI

struct SpotifySearchView: View {
    @EnvironmentObject var spotify: SpotifyService
    @Environment(\.dismiss) private var dismiss

    @StateObject private var api = SpotifyWebAPI()
    @State private var term = ""

    let onPick: (SpotifyTrack) -> Void

    var body: some View {
        NavigationView {
            VStack(spacing: 12) {
                HStack {
                    TextField("Search Spotify", text: $term)
                        .textFieldStyle(.roundedBorder)

                    Button("Go") {
                        Task {
                            guard let token = spotify.accessToken else { return }
                            await api.search(query: term, accessToken: token)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                }

                if let err = api.error {
                    Text(err).foregroundStyle(.red).font(.footnote)
                }

                List(api.results) { t in
                    Button {
                        onPick(t)
                        dismiss()
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(t.name).bold()
                            Text(t.artistName).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding()
            .navigationTitle("Spotify Search")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}
