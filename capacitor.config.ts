import type { CapacitorConfig } from "@capacitor/cli";

// CineStream Android configuration (STANDALONE APK MODE)
//
// The APK bundles the entire Next.js static export inside the APK. All API
// calls happen client-side via the CORS proxy in src/lib/moviebox-client.ts.
// No server required — the app works fully offline once installed.
//
// The webDir points to the Next.js static export output ("out" directory).
// The build workflow runs `NEXT_OUTPUT=export next build` to generate it.

const config: CapacitorConfig = {
  appId: "com.cinestream.app",
  appName: "CineStream",
  webDir: "out",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: true,
    backgroundColor: "#0f0f17",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#0f0f17",
      androidSplashResourceName: "splash",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
  },
};

export default config;
