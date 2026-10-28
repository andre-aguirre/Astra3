// ============================================================
// Astra3: macOS notarization hook (electron-builder afterSign)
// ============================================================
// Runs after electron-builder signs the .app (with build.mac.identity in
// package.json) and before it is packed into the .dmg and .zip. It
// notarizes only when all three variables below are set; otherwise it
// says so and the app is signed but not notarized, so Gatekeeper warns
// on other Macs. @electron/notarize staples the ticket to the .app after
// Apple accepts it.
//
// Required environment variables (all three, or none):
//   APPLE_ID                 - your Apple Developer account email
//   APPLE_APP_SPECIFIC_PASSWORD - an app-specific password generated
//                                 at https://appleid.apple.com
//   APPLE_TEAM_ID             - your Developer Team ID (found in the
//                                 Apple Developer portal / Xcode)
//
// Uses Apple's own `notarytool` via the @electron/notarize package
// (electron-builder's own dependency, already installed as part of
// electron-builder -- no separate package to add). This is the
// currently-recommended path per Apple/Electron's own docs (the older
// `altool` notarization flow is deprecated).
// ============================================================

module.exports = async function notarize(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return; // notarization is a macOS-only concept
  }

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log(
      "[notarize] Skipping notarization: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID " +
      "are not all set. The app is signed but not notarized, so Gatekeeper warns on other Macs. " +
      "Set all three to notarize."
    );
    return;
  }

  let notarize;
  try {
    // @electron/notarize is used here without being a direct
    // dependency of this project -- some electron-builder versions
    // bundle it transitively, but that isn't guaranteed across
    // versions, so this is intentionally NOT assumed. If the require
    // fails, the message below tells you exactly what to install
    // rather than silently skipping with a misleading reason.
    ({ notarize } = require("@electron/notarize"));
  } catch (e) {
    console.warn(
      "[notarize] Apple credentials are set, but @electron/notarize could not be loaded " +
      "(" + e.message + "). Run `npm install --save-dev @electron/notarize` and try the build " +
      "again. Skipping notarization for this build -- the app will still be signed, just not notarized."
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = require("path").join(appOutDir, `${appName}.app`);

  console.log(`[notarize] Submitting ${appPath} to Apple for notarization -- this typically takes a few minutes...`);
  try {
    await notarize({
      appPath,
      appleId: APPLE_ID,
      appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
      teamId: APPLE_TEAM_ID,
    });
    console.log("[notarize] Notarization complete.");
  } catch (e) {
    // Fail the build loudly rather than silently shipping an
    // unnotarized artifact when notarization was explicitly requested
    // (credentials were provided) but failed -- a quiet failure here
    // would be far more confusing than a build error.
    console.error("[notarize] Notarization failed:", e.message);
    throw e;
  }
};
