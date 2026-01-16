import Foundation

struct Room: Codable {
    let id: String
    let code: String
    let name: String?
}

struct QueueItem: Codable, Identifiable {
    let id: String
    let room_id: String
    let added_by: String
    let provider: String
    let track_id: String
    let title: String
    let artist: String?
    let artwork_url: String?
    let duration_ms: Int?
    let position: Int
    let status: String
}

struct PlaybackState: Codable {
    let room_id: String
    let provider: String?
    let track_id: String?
    let started_at: String?
    let is_playing: Bool
    let updated_at: String?
}
