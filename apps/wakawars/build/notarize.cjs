const path = require("node:path");
const { notarize } = require("@electron/notarize");

const getNotarizeConfig = () => {
  if (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER) {
    return {
      appleApiKey: process.env.APPLE_API_KEY,
      appleApiKeyId: process.env.APPLE_API_KEY_ID,
      appleApiIssuer: process.env.APPLE_API_ISSUER
    };
  }

  if (
    process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID
  ) {
    return {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID
    };
  }

  if (process.env.APPLE_KEYCHAIN_PROFILE) {
    return {
      keychain: process.env.APPLE_KEYCHAIN,
      keychainProfile: process.env.APPLE_KEYCHAIN_PROFILE
    };
  }

  return null;
};

exports.default = async function notarizeApp(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const config = getNotarizeConfig();
  if (!config) {
    console.log("Notarization skipped: no Apple credentials found.");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  await notarize({
    appPath,
    ...config
  });
};
