# Android App Setup (NET360)

This project now supports a native Android app shell using Capacitor while reusing the full React frontend and the same backend APIs/database as web.

## What is already implemented

- Native Android project scaffold in `android/`
- Capacitor config in `capacitor.config.json`
- Build/sync scripts in `package.json`
- Mobile-safe API behavior in `src/app/lib/api.ts`
  - Native and web use only `VITE_API_URL` (`import.meta.env.VITE_API_URL`)
  - If `VITE_API_URL` is missing, the app fails fast at startup
- Global UI crash guard via `ErrorBoundary`
- Optional native plugins:
  - Splash screen (`@capacitor/splash-screen`)
  - Status bar styling (`@capacitor/status-bar`)
  - Haptics utility helpers (`@capacitor/haptics`)
  - Push notifications bootstrap (`@capacitor/push-notifications`)
- First-time mandatory onboarding:
  - Terms and Conditions acceptance gate
  - Permission walkthrough for camera, files, internet awareness, and notifications

## 1) Required prerequisites (manual)

Install on your machine:

1. Node.js 18+
2. Java JDK 17
3. Android Studio (latest stable)
4. Android SDK + build tools from Android Studio SDK Manager

## 2) Configure environment variables

Use `.env.android.example` as reference and create your own `.env.android` (or CI env vars with Android mode):

- `VITE_API_URL=https://api.net360preparation.com`
- `VITE_ENABLE_PUSH_NOTIFICATIONS=false` (set `true` only after Firebase setup)

Important:

- API URL must be HTTPS and reachable from real Android devices.
- Use the same backend used by web so all admin updates and MCQ changes appear in mobile immediately.

## 3) Build and sync Android project

```bash
npm install
npm run mobile:build
```

This does:

1. Builds web assets to `dist/`
2. Copies/syncs assets and plugins into native Android project

## 4) Open and run in Android Studio

```bash
npm run android:open
```

Then in Android Studio:

1. Wait for Gradle sync
2. Select emulator/device
3. Run app

## 5) Ongoing development workflow

For every frontend/backend release intended for Android package:

1. Update web code
2. `npm run build`
3. `npm run android:sync`
4. Rebuild APK/AAB from Android Studio

## 6) Backend synchronization behavior

- Mobile app calls the same `/api/*` endpoints as web.
- Any admin changes in backend DB are reflected in mobile through API responses.
- Do not enable local fallback in production Android builds.

## 7) Error handling expectations

Implemented safeguards:

- Runtime crash fallback screen (`ErrorBoundary`) instead of blank pages
- API config validation for native mode
- Existing API error propagation remains active

Recommended production hardening (manual/next step):

1. Add server health check endpoint monitoring
2. Add centralized frontend error telemetry (Sentry/Crashlytics)
3. Configure retry/backoff for critical read endpoints

## 8) Release build (manual)

From Android Studio:

1. Build > Generate Signed Bundle / APK
2. Choose Android App Bundle (AAB) for Play Store
3. Use your keystore and secure passwords
4. Upload to Play Console

## 9) Firebase setup for push notifications (manual, optional)

Do this only if you want app push notifications:

1. Create/select Firebase project.
2. Add Android app with package id: `com.net360.preparation`.
3. Download `google-services.json`.
4. Place it at `android/app/google-services.json`.
5. In Firebase Console, enable Cloud Messaging.
6. Set `VITE_ENABLE_PUSH_NOTIFICATIONS=true` before building web assets.
7. Run:

```bash
npm run mobile:build
```

`mobile:build` runs `vite build --mode android`, so values should live in `.env.android` (or injected as Android-mode build env in CI).

8. Open Android Studio and rebuild app.

Note:

- Plugin currently logs push token/events to console; connect token upload to your backend endpoint when ready.

## 10) If backend is HTTP (not recommended)

Use HTTPS in production. If absolutely needed for test environments only, Android cleartext/network security config must be added manually in native project.

