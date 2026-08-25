# AIko native app

This is AIko's genuine React Native application for Android and iOS. It is not a wrapper around the Next.js website and does not contain a WebView.

## Local configuration

Copy `.env.example` to `.env.local` and add only the public mobile values:

```text
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
EXPO_PUBLIC_API_URL=https://aiko.zetbros.com
```

Never add the Supabase service-role key, OpenAI key, Dodo secret, or worker secret to this project. `EXPO_PUBLIC_*` values are included in the application bundle.

For Google OAuth, add `aiko://auth/callback` to the Supabase authentication redirect allow list. Development builds may also require the redirect URI printed by Expo for the active development environment.

For native Sign in with Apple, enable the Apple provider in Supabase and add the iOS bundle identifier `com.zetbros.aiko` to its Client IDs. The matching App ID must have the Sign in with Apple capability enabled in the Apple Developer portal. AIko uses Apple's native Authentication Services sheet; it does not use a web login wrapper.

## Run the app

```bash
cd mobile
npm ci
npm run typecheck
npm run lint
npm run android
```

On macOS, `npm run ios` opens the iOS simulator. From Windows, use an Android emulator or a physical device for local work; EAS can build iOS in the cloud.

## Native builds

Install the Expo Application Services CLI and authenticate with the AIko owner account:

```bash
npm install --global eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

Production signing and store submission require the owner's Apple Developer and Google Play Console accounts. Those credentials are intentionally not stored in this repository.

## Store billing

The native app reads the existing subscription plan from Supabase. It does not open Dodo web checkout inside the app. Digital Premium purchases in public iOS/Android builds must be implemented with Apple StoreKit and Google Play Billing, with backend entitlement synchronization.
