import type { CapacitorConfig } from "@capacitor/cli";

// ============================================================================
// CineStream Android Configuration — Thin WebView Wrapper Mode
// ============================================================================
//
// This APK is a thin native shell around your deployed Next.js web app —
// the same architecture used by the YouTube app (the YouTube APK is a
// webview that loads youtube.com, not a bundled copy of the website).
//
// All UI, all features (including AI subtitle translation, watch party,
// streaming proxy) live on your deployed Next.js server. The APK just
// loads that URL in a native Android WebView.
//
// ┌──────────────────────────────────────────────────────────────────┐
// │  CineStream APK (~4 MB)                                          │
// │  ┌────────────────────────────────────────────────────────────┐  │
// │  │  WebView → loads SERVER_URL                                 │  │
// │  └────────────────────────────────────────────────────────────┘  │
// └──────────────────────────────────────────────────────────────────┘
//                              │
//                              ▼  (HTTPS)
// ┌──────────────────────────────────────────────────────────────────┐
// │  Your deployed Next.js app (Vercel / Railway / Render / etc.)    │
// │  • All UI (React components, Tailwind, shadcn/ui)                │
// │  • All API routes (home, search, detail, play, caption, party)   │
// │  • Prisma + SQLite database                                      │
// │  • AI subtitle translation (z-ai-web-dev-sdk)                    │
// └──────────────────────────────────────────────────────────────────┘
//
// ────────────────────────────────────────────────────────────────────
// HOW TO USE
// ────────────────────────────────────────────────────────────────────
//
// 1. Deploy the Next.js app to a public host that supports Next.js with
//    API routes. Recommended (all have free tiers):
//
//    • Vercel — https://vercel.com (best for Next.js, just sign in with
//      GitHub and import the repo vineet9u866/cinestream-apk)
//    • Railway — https://railway.app
//    • Render — https://render.com
//
// 2. After deploy, copy your app's URL (e.g. https://cinestream.vercel.app)
//
// 3. Paste it below as SERVER_URL
//
// 4. Commit & push to GitHub. The Actions workflow rebuilds the APK
//    automatically in ~3 minutes. Download the new APK from the Actions tab.
//
// 5. Install on your phone — open it. It loads your live web app with
//    ALL features working (video, subtitles, AI translation, watch party,
//    everything).
//
// For local testing, set SERVER_URL to your machine's LAN IP
// (e.g. http://192.168.1.100:3000) and make sure your phone is on the
// same WiFi.
// ============================================================================

const SERVER_URL = "https://cinestream-demo.vercel.app"; // <-- UPDATE THIS

const config: CapacitorConfig = {
  appId: "com.cinestream.app",
  appName: "CineStream",
  // webDir is unused in thin-wrapper mode (server.url takes precedence),
  // but Capacitor requires it. We generate a minimal offline fallback page.
  webDir: "out",
  bundledWebRuntime: false,
  server: {
    url: SERVER_URL,
    cleartext: true, // allow http:// URLs for local dev
  },
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
