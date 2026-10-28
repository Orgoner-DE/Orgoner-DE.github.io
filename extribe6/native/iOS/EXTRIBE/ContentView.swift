import SwiftUI
import WebKit
import UIKit

struct ContentView: View {
    var body: some View { EXTRIBEWebView().ignoresSafeArea() }
}
struct EXTRIBEWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(context.coordinator, name: "studioExport")
        configuration.userContentController.add(context.coordinator, name: "projectStorage")
        configuration.userContentController.add(context.coordinator, name: "updateBridge")
        configuration.userContentController.add(context.coordinator, name: "midiBridge")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 10 / 255, green: 15 / 255, blue: 24 / 255, alpha: 1)
        guard let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") else { return webView }
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        context.coordinator.midi.webView = webView
        return webView
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "studioExport")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "projectStorage")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "updateBridge")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "midiBridge")
    }
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        let midi = MidiCoreBridge()
        private var exported = Data()
        private var expected = 0
        private var exportName = "EXTRIBE.json"
        private var inProgress = false
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame,
                  let payload = message.body as? [String: Any],
                  let kind = payload["kind"] as? String else { return }
            if message.name == "midiBridge" {
                midi.handle(payload)
                return
            }
            if message.name == "updateBridge" {
                updateRequest(payload, webView: message.webView)
                return
            }
            if message.name == "projectStorage" {
                projectStorageRequest(payload, webView: message.webView)
                return
            }
            guard message.name == "studioExport" else { return }
            switch kind {
            case "begin":
                guard let length = payload["size"] as? Int, length >= 0, length <= 100 * 1048576 else { return }
                expected = length
                exported = Data()
                let proposed = payload["name"] as? String ?? "EXTRIBE.json"
                exportName = (proposed as NSString).lastPathComponent
                if exportName.isEmpty { exportName = "EXTRIBE.json" }
                inProgress = true
            case "chunk":
                guard inProgress, let text = payload["base64"] as? String, text.count <= 50000,
                      let chunk = Data(base64Encoded: text), exported.count + chunk.count <= expected else {
                    inProgress = false; exported = Data(); return
                }
                exported.append(chunk)
            case "end":
                guard inProgress, exported.count == expected else { inProgress = false; exported = Data(); return }
                inProgress = false
                let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + exportName)
                do {
                    try exported.write(to: file, options: .atomic)
                    exported = Data()
                    let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                    guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
                          let presenter = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else { return }
                    if let popover = share.popoverPresentationController {
                        popover.sourceView = presenter.view
                        popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                    }
                    presenter.present(share, animated: true)
                } catch { exported = Data() }
            case "abort": inProgress = false; exported = Data()
            default: break
            }
        }
        private func projectStorageRequest(_ payload: [String: Any], webView: WKWebView?) {
            guard let id = payload["id"] as? Int, let kind = payload["kind"] as? String else { return }
            var response: [String: Any] = ["id": id, "ok": false, "value": NSNull()]
            do {
                let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let isLibrary = kind == "librarySave" || kind == "libraryLoad"
                let isMidi = kind == "midiSave" || kind == "midiLoad"
                let file = directory.appendingPathComponent(isMidi ? "extribe-midi-mappings.json" : (isLibrary ? "extribe-user-packs.json" : "extribe-project.json"))
                if kind == "save" || kind == "librarySave" || kind == "midiSave" {
                    guard let content = payload["content"] as? String, content.utf8.count <= 100 * 1048576 else { throw NSError(domain: "EXTRIBE", code: 10) }
                    try Data(content.utf8).write(to: file, options: .atomic)
                    response["ok"] = true
                } else if kind == "load" || kind == "libraryLoad" || kind == "midiLoad" {
                    if FileManager.default.fileExists(atPath: file.path) {
                        let data = try Data(contentsOf: file)
                        guard data.count <= 100 * 1048576, let content = String(data: data, encoding: .utf8) else { throw NSError(domain: "EXTRIBE", code: 11) }
                        response["value"] = content
                    } else { response["value"] = "" }
                    response["ok"] = true
                } else { return }
            } catch {
                response["error"] = error.localizedDescription
            }
            if let data = try? JSONSerialization.data(withJSONObject: response),
               let json = String(data: data, encoding: .utf8) {
                webView?.evaluateJavaScript("window.__nativeProjectResponse(\(json))", completionHandler: nil)
            }
        }
        private func updateRequest(_ data: [String:Any], webView: WKWebView?) {
            if (data["kind"] as? String) == "open", let raw = data["url"] as? String,
               let url = URL(string: raw), url.scheme == "https" {
                let allowed = (url.host == "orgoner-de.github.io" && url.path.hasPrefix("/extribe5/")) || (url.host == "github.com" && url.path.hasPrefix("/Orgoner-DE/"))
                if allowed { DispatchQueue.main.async { UIApplication.shared.open(url) } }
                return
            }
            guard (data["kind"] as? String) == "check",
                  let url = URL(string:"https://orgoner-de.github.io/extribe5/latest.json") else { return }
            var request = URLRequest(url:url); request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 6
            URLSession.shared.dataTask(with:request) { data, resp, err in
                guard err == nil, let data = data, data.count < 16384,
                      let json = try? JSONSerialization.jsonObject(with:data) as? [String:Any],
                      let asData=try? JSONSerialization.data(withJSONObject:json),
                      let encoded=String(data:asData,encoding:.utf8),
                      let escaped=try? JSONSerialization.data(withJSONObject:[encoded],options:[.fragmentsAllowed]),
                      let text=String(data:escaped,encoding:.utf8) else { return }
                // Use JSON array's first element as a safely-escaped JS string.
                DispatchQueue.main.async { webView?.evaluateJavaScript("window.EXTRIBE_receiveNativeUpdate((" + text + ")[0])",completionHandler:nil) }
            }.resume()
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if url.scheme == "https", ((url.host == "orgoner-de.github.io" && url.path.hasPrefix("/extribe5/")) || (url.host == "github.com" && url.path.hasPrefix("/Orgoner-DE/"))) {
                UIApplication.shared.open(url)
            }
            decisionHandler(url.isFileURL || url.scheme == "about" ? .allow : .cancel)
        }
    }
}
