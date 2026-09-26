import type { CapacitorConfig } from "@capacitor/cli";

// CineStream Android configuration
//
// This app uses Next.js API routes (server-side), so the APK loads a remote URL.
// Update SERVER_URL below to your deployed Next.js app (e.g. on Vercel, Railway,
// Netlify, or any host that supports Next.js 16). The APK is a native webview
// wrapper around your deployed web app.
//
// To change the URL:
//   1. Update SERVER_URL below
//   2. Push to GitHub — the Actions workflow will rebuild the APK automatically
//
// For local development, you can use your machine's LAN IP (e.g.
// http://192.168.1.100:3000) — make sure your phone is on the same WiFi.

const SERVER_URL = "https://cinestream-demo.vercel.app"; // <-- UPDATE THIS

const config: CapacitorConfig = {
  appId: "com.cinestream.app",
  appName: "CineStream",
  webDir: "out", // Next.js static export output (used as fallback if server.url is unset)
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
