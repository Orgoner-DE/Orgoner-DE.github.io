import SwiftUI
import WebKit
import UIKit

@main struct OrgonerStudioApp:App {
    var body:some Scene {WindowGroup { StudioWebView().ignoresSafeArea(edges:.bottom) }}
}
struct StudioWebView:UIViewRepresentable {
    func makeCoordinator()->Coordinator {Coordinator()}
    func makeUIView(context:Context)->WKWebView {
        let config=WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript=true
        config.preferences.javaScriptCanOpenWindowsAutomatically=false
        config.userContentController.add(context.coordinator,name:"studioExport")
        let w=WKWebView(frame:.zero,configuration:config)
        w.navigationDelegate=context.coordinator
        w.uiDelegate=context.coordinator
        w.isOpaque=false
        w.backgroundColor = .black
        guard let url=Bundle.main.url(forResource:"index",withExtension:"html",subdirectory:"Web") else{return w}
        w.loadFileURL(url,allowingReadAccessTo:url.deletingLastPathComponent())
        return w
    }
    func updateUIView(_ view:WKWebView,context:Context){}
    static func dismantleUIView(_ view:WKWebView,coordinator:Coordinator){
        view.configuration.userContentController.removeScriptMessageHandler(forName:"studioExport")
    }
    final class Coordinator:NSObject,WKScriptMessageHandler,WKNavigationDelegate,WKUIDelegate{
        private var bytes=Data()
        private var name="Export.zip"
        private var expected=0
        private var started=false
        func userContentController(_ controller:WKUserContentController,didReceive message:WKScriptMessage){
            guard message.name=="studioExport",message.frameInfo.isMainFrame,let body=message.body as? [String:Any],let kind=body["kind"] as? String else{return}
            switch kind {
            case "begin":
                guard let n=body["size"] as? Int,n>=0,n<=100*1048576 else{return}
                let raw=body["name"] as? String ?? "Export.zip"
                name=(raw as NSString).lastPathComponent
                if name.isEmpty{name="Export.zip"}
                bytes=Data();expected=n;started=true
            case "chunk":
                guard started,let text=body["base64"] as? String,text.count<=50000,let incoming=Data(base64Encoded:text),bytes.count+incoming.count<=expected else{started=false;bytes=Data();return}
                bytes.append(incoming)
            case "end":
                guard started,bytes.count==expected else{started=false;bytes=Data();return}
                started=false
                let url=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString+"-"+name)
                do {
                    try bytes.write(to:url,options:.atomic);bytes=Data()
                    let sheet=UIActivityViewController(activityItems:[url],applicationActivities:nil)
                    guard let scene=UIApplication.shared.connectedScenes.compactMap({$0 as? UIWindowScene}).first,
                          let presenter=scene.windows.first(where:{$0.isKeyWindow})?.rootViewController else{return}
                    if let p=sheet.popoverPresentationController {p.sourceView=presenter.view;p.sourceRect=CGRect(x:presenter.view.bounds.midX,y:presenter.view.bounds.midY,width:1,height:1)}
                    presenter.present(sheet,animated:true)
                } catch{bytes=Data()}
            case "abort":started=false;bytes=Data()
            default:break
            }
        }
        func webView(_ w:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
            guard let url=action.request.url else{decisionHandler(.cancel);return}
            decisionHandler(url.isFileURL||url.scheme=="about" ? .allow:.cancel)
        }
    }
}