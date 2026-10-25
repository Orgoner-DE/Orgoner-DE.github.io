import Foundation
import CoreMIDI
import WebKit

/// Native CoreMIDI input for the iOS EX-TRIBE WKWebView.
/// USB MIDI and already-connected CoreMIDI sources; no microphone permission needed.
final class MidiCoreBridge {
    weak var webView: WKWebView?
    private var client = MIDIClientRef()
    private var port = MIDIPortRef()
    private var connected: [MIDIEndpointRef] = []
    private var isStarted = false

    func handle(_ payload: [String: Any]) {
        guard let kind = payload["kind"] as? String else { return }
        switch kind {
        case "connect": connect()
        case "select": refreshSources()
        case "list": sendSources()
        case "loadPreset":
            let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            let file = directory.appendingPathComponent("extribe-midi-mappings.json")
            if let data = try? Data(contentsOf: file), data.count < 150000,
               let content = String(data: data, encoding: .utf8) {
                sendJSON(["content": content], function: "EXTRIBE_MIDI_receivePreset")
            }
        default: break
        }
    }
    func connect() {
        if isStarted { refreshSources(); return }
        guard MIDIClientCreateWithBlock("EX-TRIBE MIDI" as CFString, &client, { [weak self] _ in
            DispatchQueue.main.async { self?.refreshSources() }
        }) == noErr else { return }
        guard MIDIInputPortCreateWithBlock(client, "EX-TRIBE INPUT" as CFString, &port, { [weak self] list, ref in
            self?.processPackets(list, source: ref)
        }) == noErr else { MIDIClientDispose(client); client = 0; return }
        isStarted = true
        refreshSources()
    }
    private func endpointId(_ endpoint: MIDIEndpointRef) -> MIDIUniqueID {
        var uid: MIDIUniqueID = 0
        MIDIObjectGetIntegerProperty(endpoint, kMIDIPropertyUniqueID, &uid)
        return uid
    }
    private func endpointName(_ endpoint: MIDIEndpointRef) -> String {
        var unmanaged: Unmanaged<CFString>?
        guard MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &unmanaged) == noErr,
              let name = unmanaged?.takeRetainedValue() else { return "MIDI Eingabegerät" }
        return name as String
    }
    private func refreshSources() {
        guard isStarted else { return }
        for old in connected { MIDIPortDisconnectSource(port, old) }
        connected.removeAll()
        for index in 0..<MIDIGetNumberOfSources() {
            let source = MIDIGetSource(index)
            guard source != 0 else { continue }
            let uid = endpointId(source)
            let ref = UnsafeMutableRawPointer(bitPattern: Int(uid))
            if MIDIPortConnectSource(port, source, ref) == noErr { connected.append(source) }
        }
        sendSources()
    }
    private func sendSources() {
        var sources: [[String: String]] = []
        for endpoint in connected {
            sources.append(["id": String(endpointId(endpoint)), "name": endpointName(endpoint)])
        }
        sendJSON(sources, function: "EXTRIBE_MIDI_devices")
    }
    private func processPackets(_ packetList: UnsafePointer<MIDIPacketList>, source: UnsafeMutableRawPointer?) {
        let id = source.map { String(Int(bitPattern: $0)) } ?? ""
        withUnsafePointer(to: packetList.pointee.packet) { first in
            var ptr = first
            for _ in 0..<Int(packetList.pointee.numPackets) {
                let length = min(Int(ptr.pointee.length), 256)
                let bytes = withUnsafeBytes(of: ptr.pointee.data) { Array($0.prefix(length)) }
                if !bytes.isEmpty {
                    self.sendJSON(["device": id, "bytes": bytes] as [String: Any], function: "EXTRIBE_MIDI_receive")
                }
                ptr = UnsafePointer(MIDIPacketNext(ptr))
            }
        }
    }
    private func sendJSON(_ data: Any, function: String) {
        guard JSONSerialization.isValidJSONObject(data),
              let bytes = try? JSONSerialization.data(withJSONObject: data),
              let json = String(data: bytes, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.\(function)(\(json))", completionHandler: nil)
        }
    }
    deinit {
        if port != 0 { MIDIPortDispose(port) }
        if client != 0 { MIDIClientDispose(client) }
    }
}
