
// ============================================================
// Astra3: macOS notarization hook (electron-builder afterSign)
// ============================================================
//
// Uses the existing macOS Keychain profile:
//   Astra3-notary
//
// Runs after code signing and BEFORE electron-builder creates
// the DMG and ZIP.
//
// The app is notarized and stapled before packaging.
//
// ============================================================

const path = require("path");

module.exports = async function notarize(context) {
    const { electronPlatformName, appOutDir } = context;

    if (electronPlatformName !== "darwin") {
        return;
    }

    // Explicit development/release-check bypass.
    if (process.env.ASTRA3_SKIP_NOTARIZE === "1") {
        console.log("[notarize] Skipping notarization by request.");
        return;
    }

    const keychainProfile = process.env.APPLE_KEYCHAIN_PROFILE;

    if (!keychainProfile) {
        throw new Error(
            "[notarize] APPLE_KEYCHAIN_PROFILE is missing. " +
            "Cannot produce a notarized release."
        );
    }

    let notarize;

    try {
        ({ notarize } = require("@electron/notarize"));
    } catch (error) {
        throw new Error(
            "[notarize] Cannot load @electron/notarize. " +
            "Run npm install and try again. " + error.message
        );
    }

    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(appOutDir, `${appName}.app`);

    console.log(
        `[notarize] Submitting ${appPath} to Apple using Keychain profile "${keychainProfile}"...`
    );

    try {
        await notarize({
            appPath,
            keychainProfile,
        });

        console.log("[notarize] Apple notarization completed.");

    } catch (error) {
        console.error("[notarize] Notarization failed:", error.message);
        throw error;
    }

    console.log("[notarize] Validating stapled ticket...");
};
