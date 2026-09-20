import Foundation
import UIKit
import Capacitor

/**
 * Focus mode, iOS side: requests a Guided Access session. Guided Access
 * must already be turned on once in Settings > Accessibility -- this only
 * starts/ends a session, it can't enable the feature itself.
 */
@objc(KioskPlugin)
public class KioskPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KioskPlugin"
    public let jsName = "Kiosk"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enterFocusMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exitFocusMode", returnType: CAPPluginReturnPromise)
    ]

    @objc func enterFocusMode(_ call: CAPPluginCall) {
        UIAccessibility.requestGuidedAccessSession(enabled: true) { _ in
            call.resolve()
        }
    }

    @objc func exitFocusMode(_ call: CAPPluginCall) {
        UIAccessibility.requestGuidedAccessSession(enabled: false) { _ in
            call.resolve()
        }
    }
}
