import SwiftUI
import AVFoundation
@main
struct EXTRIBEApp: App {
    init() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
    }
    var body: some Scene { WindowGroup { ContentView().ignoresSafeArea(.keyboard) } }
}