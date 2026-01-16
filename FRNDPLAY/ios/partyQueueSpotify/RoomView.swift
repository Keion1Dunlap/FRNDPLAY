import SwiftUI

struct RoomView: View {
    @EnvironmentObject var socket: SocketService
    @EnvironmentObject var spotify: SpotifyService

    @Binding var room: Room?
    @Binding var queue: [QueueItem]
    @Binding var playback: PlaybackState?

    @State private var showSearch = false
    @State private var msg = ""

    var body: some View {
        guard let r = room else { return AnyView(Text("No room")) }

        return AnyView(
            VStack(spacing: 12) {
                HStack {
                    VStack(alignment: .leading) {
                        Text(r.name ?? "Party").font(.title3).bold()
                        Text("Code: \(r.code)").font(.footnote).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Leave") {
                        room = nil
                        queue = []
                        playback = nil
                    }
                    .buttonStyle(.bordered)
                }

                Text(nowPlayingText())
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                HStack(spacing: 10) {
                    Button("Search + Add") { showSearch = true }
                        .buttonStyle(.borderedProminent)

                    Button("Host: Play First") { hostPlayFirst(roomId: r.id) }
                        .buttonStyle(.borderedProminent)

                    Button("Pause") { spotify.pause() }
                        .buttonStyle(.bordered)
                }

                if let err = spotify.error {
                    Text(err).foregroundStyle(.red).font(.footnote)
                }
                if !msg.isEmpty {
                    Text(msg).foregroundStyle(.red).font(.footnote)
                }

                List(queue) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(item.position). \(item.title)").bold()
                        Text(item.artist ?? "").font(.footnote).foregroundStyle(.secondary)
                        Text(item.track_id).font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            .padding()
            .sheet(isPresented: $showSearch) {
                SpotifySearchView { track in
                    socket.addToQueue(roomId: r.id, trackURI: track.uri, title: track.name, artist: track.artistName)
                }
                .environmentObject(spotify)
            }
        )
    }

    private func nowPlayingText() -> String {
        if let p = playback, let tid = p.track_id {
            return "Now Playing: \(tid) (\(p.is_playing ? "playing" : "paused"))"
        }
        return "Now Playing: Nothing"
    }

    private func hostPlayFirst(roomId: String) {
        msg = ""
        guard spotify.connected else {
            msg = "Connect Spotify first (and make sure Spotify app is installed)."
            return
        }
        guard let first = queue.first else {
            msg = "Queue is empty."
            return
        }

        // 1) play in Spotify app
        spotify.play(uri: first.track_id)

        // 2) tell the room what is playing
        socket.setPlayback(roomId: roomId, trackURI: first.track_id, isPlaying: true) { ok, err in
            if !ok { msg = err ?? "Host only" }
        }
    }
}
