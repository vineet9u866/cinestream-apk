# CineStream Android APK

This repository contains the **CineStream** Next.js web app plus Capacitor configuration for building a native Android APK via GitHub Actions.

## How the APK works

CineStream is a server-rendered Next.js app (uses API routes for `/api/home`, `/api/search`, `/api/detail`, etc., plus Prisma + SQLite). Because native Android can't run a Node.js server, the APK is a **Capacitor WebView wrapper** that loads your **deployed Next.js URL**.

```
┌──────────────────────────────────────────┐
│  CineStream APK (this repo)              │
│  ┌────────────────────────────────────┐  │
│  │  WebView (loads remote URL)        │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
              │
              ▼  (HTTPS)
┌──────────────────────────────────────────┐
│  Your deployed Next.js app               │
│  (Vercel / Railway / Netlify / your box) │
│  - API routes                            │
│  - Prisma + SQLite                       │
└──────────────────────────────────────────┘
```

## Configure the URL

Edit `capacitor.config.ts`:

```ts
const SERVER_URL = "https://your-deployed-app.vercel.app"; // <-- update this
```

Then commit and push — GitHub Actions will rebuild the APK automatically.

For local development, use your machine's LAN IP (e.g. `http://192.168.1.100:3000`) and make sure your phone is on the same WiFi.

## Build the APK

### Option A — GitHub Actions (automatic)

1. Push to `main` (or trigger the workflow manually from the Actions tab)
2. Wait ~5–10 minutes for the build to complete
3. Download the `cinestream-debug-apk` artifact from the workflow run page
4. Install the APK on your Android phone (enable "Install from unknown sources" if needed)

### Option B — Local build

Requirements:
- Node.js 20+
- Java 17
- Android SDK (Platform 34, Build-Tools 34.0.0)

```bash
npm install
npx prisma generate
mkdir -p out && echo '<html><body>CineStream</body></html>' > out/index.html
npx cap sync android
cd android && ./gradlew assembleDebug
# APK at android/app/build/outputs/apk/debug/app-debug.apk
```

## App identity

- **App ID:** `com.cinestream.app`
- **App name:** CineStream
- **Version:** 1.0.0
- **Min Android:** 5.1 (API 22)
- **Target Android:** 14 (API 34)
- **Icon:** generated from `public/logo.svg` (master 1024×1024)

## Project layout

```
.
├── capacitor.config.ts         # Capacitor config (set SERVER_URL here)
├── android/                    # Native Android project
│   ├── app/
│   │   ├── build.gradle
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── java/com/cinestream/app/MainActivity.java
│   │       └── res/
│   │           ├── mipmap-*/              # Launcher icons (your logo)
│   │           ├── mipmap-anydpi-v26/     # Adaptive icons (Android 8+)
│   │           ├── values/                # colors, strings, styles
│   │           ├── drawable/splash.xml    # Splash screen
│   │           └── xml/file_paths.xml
│   ├── gradle/wrapper/
│   ├── build.gradle
│   ├── settings.gradle
│   ├── variables.gradle
│   ├── gradlew
│   └── capacitor.settings.gradle
├── .github/workflows/build-apk.yml   # GitHub Actions APK build
├── src/                         # Next.js source
├── prisma/                      # Database schema
├── public/                      # Web assets (incl. logo.svg)
└── package.json
```

## Troubleshooting

**APK shows "Offline fallback" page** — `SERVER_URL` in `capacitor.config.ts` is unreachable. Make sure your deployed app is publicly accessible (not `localhost`).

**APK shows blank white screen** — likely a mixed-content block. If your deployed URL is HTTPS but the app tries to load HTTP resources, fix the deployed app. `cleartext: true` is already set in the config for local dev.

**Build fails in GitHub Actions** — check the Actions logs. Common issues: Android SDK license not accepted (the `setup-android` action handles this), Java version mismatch (we use Java 17), or missing `node_modules` (make sure `npm install` ran).

**Want a real standalone APK (no server needed)?** — refactor the Next.js app to call the external MovieBox API directly from the client (remove the `/api/*` proxy routes), then change `next.config.ts` to `output: 'export'` and remove `server.url` from `capacitor.config.ts`. The static export will be bundled inside the APK.
