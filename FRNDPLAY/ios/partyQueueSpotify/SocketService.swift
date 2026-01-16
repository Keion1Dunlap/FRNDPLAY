import Foundation
import SocketIO

final class SocketService: ObservableObject {
    private var manager: SocketManager?
    private var socket: SocketIOClient?

    @Published var connected: Bool = false

    var onQueueUpdated: ((String, QueueItem) -> Void)?
    var onPlaybackUpdated: ((PlaybackState) -> Void)?

    func connect(accessToken: String) {
        disconnect()

        // Swift Socket.IO-Client doesn't support Socket.IO v4 "auth" payload the same
        // way as the JS client. The most reliable approach is to send the token as
        // connect params (query string). Our server accepts both auth and query.
        manager = SocketManager(socketURL: Config.serverURL, config: [
            .log(false),
            .compress,
            .forceWebsockets(true),
            .reconnects(true),
            .connectParams(["accessToken": accessToken])
        ])

        guard let manager else { return }
        socket = manager.defaultSocket

        socket?.on(clientEvent: .connect) { [weak self] _, _ in self?.connected = true }
        socket?.on(clientEvent: .disconnect) { [weak self] _, _ in self?.connected = false }

        socket?.on("QUEUE_UPDATED") { [weak self] data, _ in
            guard
                let dict = data.first as? [String: Any],
                let type = dict["type"] as? String,
                let itemDict = dict["item"] as? [String: Any],
                let item = self?.decode(QueueItem.self, from: itemDict)
            else { return }
            self?.onQueueUpdated?(type, item)
        }

        socket?.on("PLAYBACK_UPDATED") { [weak self] data, _ in
            guard
                let dict = data.first as? [String: Any],
                let state = self?.decode(PlaybackState.self, from: dict)
            else { return }
            self?.onPlaybackUpdated?(state)
        }

        socket?.connect()
    }

    func disconnect() {
        socket?.disconnect()
        socket = nil
        manager = nil
        connected = false
    }

    func createRoom(name: String, completion: @escaping (Result<Room, Error>) -> Void) {
        socket?.emitWithAck("ROOM_CREATE", ["name": name]).timingOut(after: 8) { data in
            completion(self.parseRoomResponse(data))
        }
    }

    func joinRoom(code: String, completion: @escaping (Result<(Room, [QueueItem], PlaybackState?), Error>) -> Void) {
        socket?.emitWithAck("ROOM_JOIN", ["code": code]).timingOut(after: 8) { data in
            completion(self.parseJoinResponse(data))
        }
    }

    func addToQueue(roomId: String, trackURI: String, title: String, artist: String?) {
        let payload: [String: Any] = [
            "roomId": roomId,
            "provider": "spotify",
            "track": [
                "trackId": trackURI,
                "title": title,
                "artist": artist ?? ""
            ]
        ]
        socket?.emit("QUEUE_ADD", payload)
    }

    func setPlayback(roomId: String, trackURI: String?, isPlaying: Bool, completion: @escaping (Bool, String?) -> Void) {
        let payload: [String: Any] = [
            "roomId": roomId,
            "trackId": trackURI as Any,
            "isPlaying": isPlaying
        ]

        socket?.emitWithAck("PLAYBACK_SET", payload).timingOut(after: 8) { data in
            if let dict = data.first as? [String: Any], let ok = dict["ok"] as? Bool, ok == true {
                completion(true, nil)
            } else {
                let err = (data.first as? [String: Any])?["error"] as? String
                completion(false, err ?? "Host only")
            }
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from dict: [String: Any]) -> T? {
        do {
            let data = try JSONSerialization.data(withJSONObject: dict)
            return try JSONDecoder().decode(T.self, from: data)
        } catch { return nil }
    }

    private func parseRoomResponse(_ data: [Any]) -> Result<Room, Error> {
        guard let dict = data.first as? [String: Any], let ok = dict["ok"] as? Bool else {
            return .failure(NSError(domain: "Socket", code: 0))
        }
        if ok, let roomDict = dict["room"] as? [String: Any], let room = decode(Room.self, from: roomDict) {
            return .success(room)
        }
        return .failure(NSError(domain: "Socket", code: 1, userInfo: [
            NSLocalizedDescriptionKey: (dict["error"] as? String) ?? "Unknown error"
        ]))
    }

    private func parseJoinResponse(_ data: [Any]) -> Result<(Room, [QueueItem], PlaybackState?), Error> {
        guard let dict = data.first as? [String: Any], let ok = dict["ok"] as? Bool else {
            return .failure(NSError(domain: "Socket", code: 0))
        }
        if !ok {
            return .failure(NSError(domain: "Socket", code: 1, userInfo: [
                NSLocalizedDescriptionKey: (dict["error"] as? String) ?? "Join failed"
            ]))
        }
        guard let roomDict = dict["room"] as? [String: Any],
              let room = decode(Room.self, from: roomDict) else {
            return .failure(NSError(domain: "Socket", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Bad room payload"
            ]))
        }
        let queue = (dict["queue"] as? [[String: Any]] ?? []).compactMap { decode(QueueItem.self, from: $0) }
        let playback = (dict["playback"] as? [String: Any]).flatMap { decode(PlaybackState.self, from: $0) }
        return .success((room, queue, playback))
    }
}
