import SwiftUI
import AVFoundation

@main
struct EXTRIBEApp: App {
    init() {
        // Avoid activating the audio session until playback starts.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
    }
    var body: some Scene {
        WindowGroup { ContentView().ignoresSafeArea() }
    }
}
