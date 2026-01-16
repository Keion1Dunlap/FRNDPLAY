import SwiftUI

struct RootView: View {
    @StateObject private var supa = SupabaseService()
    @StateObject private var socket = SocketService()
    @StateObject private var spotify = SpotifyService()

    @State private var room: Room? = nil
    @State private var queue: [QueueItem] = []
    @State private var playback: PlaybackState? = nil

    var body: some View {
        Group {
            if supa.accessToken == nil {
                AuthView()
                    .environmentObject(supa)
            } else {
                if room == nil {
                    HomeView(room: $room, queue: $queue, playback: $playback)
                        .environmentObject(supa)
                        .environmentObject(socket)
                        .environmentObject(spotify)
                } else {
                    RoomView(room: $room, queue: $queue, playback: $playback)
                        .environmentObject(socket)
                        .environmentObject(spotify)
                }
            }
        }
        .task { await supa.restoreSession() }
        .onChange(of: supa.accessToken) { token in
            guard let token else { socket.disconnect(); return }
            socket.connect(accessToken: token)
            wireSocket()
        }
        .onAppear {
            AppDelegate.onOpenURL = { url in
                spotify.handleRedirectURL(url)
            }
        }
    }

    private func wireSocket() {
        socket.onQueueUpdated = { type, item in
            DispatchQueue.main.async {
                if type == "added" {
                    queue.append(item)
                    queue.sort { $0.position < $1.position }
                } else if type == "removed" {
                    queue.removeAll { $0.id == item.id }
                }
            }
        }
        socket.onPlaybackUpdated = { state in
            DispatchQueue.main.async { playback = state }
        }
    }
}
