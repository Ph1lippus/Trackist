# Trackist

Track your movies and TV shows — all in one place. A modern, privacy-focused watchlist app built with React, TypeScript, and Supabase.

**This product uses the TMDB API but is not endorsed or certified by TMDB.**

## Features

- **User Authentication** — Secure sign-up, password and Google login, password recovery, manual Google account linking, and optional TOTP two-factor authentication via Supabase Auth.
- **Search** — Discover movies and TV shows by title, plus browse cast and crew details.
- **Watchlists** — Personal lists with public/private sharing. Mark shows/movies as planning, watching, completed, or caught up.
- **Episode Tracking** — For TV shows, mark individual episodes as watched, unwatch them, and see your progress at a glance.
- **Statistics** — Visual insights into your watch history, including runtime totals, status breakdowns, and genre trends.
- **Responsive Design** — Dedicated mobile UI for on-the-go tracking, with a native-app-like experience.
- **Native App** — Built with Capacitor for iOS and Android.
- **Addon Integration** — Open episodes directly in Stremio or other media players via deep links.
- **Progressive Episode Discovery** — Automatically detects when shows have new episodes and marks them as "watching" so you always know what to continue next.
- **Push Notifications** — Native and web push notifications for new episodes, seasons, and movie releases (theatrical and digital).

## Screenshots

### Desktop

| Discover | TV Show Detail | Movie Detail |
| --- | --- | --- |
| ![Discover](https://track1st.vercel.app/og-image.png) | 
  ![TV Show Detail](https://track1st.vercel.app/og-image.png) | 
  ![Movie Detail](https://track1st.vercel.app/og-image.png) |

### Mobile

| Discover | TV Show Detail | Movie Detail |
| --- | --- | --- | 
  ![Discover Mobile](https://track1st.vercel.app/og-image.png) |
  ![TV Show Mobile](https://track1st.vercel.app/og-image.png) | 
  ![TV Show Detail Mobile](https://track1st.vercel.app/og-image.png) |
  ![Movie Detail Mobile](https://track1st.vercel.app/og-image.png) |


### Mobile


## Tech Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | React 19, TypeScript, Vite, React Router v7, Zustand (state management) |
| **UI** | Bootstrap 5, Font Awesome, custom CSS (9,500+ lines) |
| **Backend & Database** | Supabase (PostgreSQL, Auth, Realtime) |
| **APIs** | [TMDB](https://www.themoviedb.org/documentation/api) (movies/TV data) |
| **Performance** | React Virtuoso (virtualized lists), SWR-style caching with 6-hour TTL |
| **Deployment** | Vercel (with Speed Insights & Analytics) |
| **Native** | Capacitor (iOS and Android builds) |

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- A [TMDB API key](https://www.themoviedb.org/settings/api) (free)
- A [Supabase project](https://supabase.com/) with the database schema set up
- Supabase CLI (`npm install -g supabase`)

### Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_TMDB_API_KEY=your_tmdb_api_key
```

### Database Setup

1. Create a new Supabase project.
2. Open the Supabase dashboard → **SQL Editor**.
3. Run the schema from [`sql.sql`](sql.sql) to create all tables, policies, and indexes.
4. Run the following migration SQLs in order to add notification enhancements, RLS policies, and helper tables:

```sql
-- Notification enhancements (columns + indexes)
-- File: supabase/migrations/20260830_notification_enhancements.sql

-- Native push support
-- File: supabase/migrations/20260829_native_push.sql

-- Push subscriptions RLS policies
-- File: supabase/migrations/20260831_push_subscriptions_rls.sql

-- Notification check throttle
-- File: supabase/migrations/20260905_notification_check_throttle.sql

-- TMDB button profile flag
-- File: supabase/migrations/20260901_tmdb_button_profile_flag.sql
```

5. Enable the `pg_cron` and `pg_net` extensions in the Supabase SQL Editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

### Supabase Auth Configuration

In **Authentication → URL Configuration**, add these redirect URLs:

- `https://track1st.vercel.app/login`
- `http://localhost:5173/login`
- `http://localhost:3000/login`
- `https://track1st.vercel.app/reset-password`
- `http://localhost:5173/reset-password`
- `http://localhost:3000/reset-password`
- `https://track1st.vercel.app/Settings/security`
- `http://localhost:5173/Settings/security`
- `http://localhost:3000/Settings/security`

Also add the Android app's callback. It is only needed by the web-hosted build and by builds updated mid-round-trip, but harmless to keep:

- `com.track1st.app://auth/callback`

This must stay in sync with `nativeAuthCallbackUrl` in `src/services/profileService.ts` and the `com.track1st.app://auth` intent filter in `android/app/src/main/AndroidManifest.xml`.

Enable the **Google** provider in **Authentication → Providers** and configure its Google OAuth client ID and secret. Users can link or unlink Google manually from **Settings → Security** while signed in.

### Google sign-in on Android

Android does not use a browser round-trip. `@capgo/capacitor-social-login` calls **Google Credential Manager**, which shows the account picker already built into the phone, and hands Supabase the resulting ID token via `signInWithIdToken`. There is no redirect to lose, so nothing depends on a deep link returning to the app. The web build keeps the normal OAuth redirect.

`MainActivity` must implement `ModifiedMainActivityForSocialLoginPlugin`. The plugin rejects any call that passes explicit `scopes` unless the activity implements this marker interface, because it needs the activity result to complete the scope grant. Without it, sign-in fails with *"You CANNOT use scopes without modifying the main activity"*. The interface method has an empty body by design; `npx cap sync` does not overwrite `MainActivity.java`, so the change survives rebuilds.

This needs **two** OAuth clients in the **same** Google Cloud project:

| Client type | Where it goes |
| --- | --- |
| **Web application** | `VITE_GOOGLE_WEB_CLIENT_ID`. Credential Manager uses this as the ID token audience, and Supabase validates against it. |
| **Android** | Google Cloud Console only — proves the APK may call Google. Never passed to `VITE_GOOGLE_WEB_CLIENT_ID`. |

The Android client must list `com.track1st.app` and the **SHA-1 of the certificate the installed APK is signed with**:

```bash
keytool -list -v -keystore android/app/upload.keystore -storetype pkcs12 \
  -alias track1st -storepass "$TRACK1ST_KEYSTORE_PASSWORD" | grep SHA1
```

Use the SHA-1 of the build you actually install — the release keystore, not the debug one, and Play App Signing's key if you ever ship through Play. Google rejects the combination with `[28444] Developer console is not set up correctly`, which the app translates into a message naming the cause. Console changes can take a few hours to propagate. `assetlinks.json` is **not** needed for this flow.

If the OAuth consent screen is in **Testing**, only accounts under **Audience → Test users** can sign in. Click **Publish app** to move it to **In production**, which is what a publicly distributed app needs. Set the audience to **External** first, or consumer `@gmail.com` accounts are blocked.

This app requests only the basic identity scopes (`openid`, `email`, `profile`), so publishing needs **no verification review** and imposes **no 100-user cap** — both of those only apply to sensitive or restricted scopes. Until branding is verified, Google hides the app name and logo on the consent screen; sign-in still works. Until brand verification is submitted, the app can still be used, only the cosmetic branding differs.

### Android App Links (shared links opening the app)

Shared `https://track1st.vercel.app/...` links only open inside the APK when Android can verify that domain against the certificate the app is signed with, using `public/.well-known/assetlinks.json`. The check runs once, at install time, and fails silently: a stale fingerprint does not break the build, it just sends every shared link to the browser.

Read the fingerprint of the release signing key:

```bash
keytool -list -v -keystore android/app/upload.keystore -storetype pkcs12 \
  -alias track1st -storepass "$TRACK1ST_KEYSTORE_PASSWORD" | grep SHA256
```

Add the result to `sha256_cert_fingerprints` in `public/.well-known/assetlinks.json` and redeploy. Keep the previous fingerprint in the list too, so installs signed with an earlier key keep working.

How quickly a fix reaches users depends on their Android version:

- **Installing or updating the app** re-runs verification, so pushing a new build is enough to pick up the corrected file.
- **Android 15 (API 35) and higher** also re-verify domains periodically in the background. The app targets SDK 36, so most devices recover on their own within days, though propagation can take up to seven days.
- **Android 14 and lower** do not re-verify in the background; they pick up the corrected file on the next install or update.

To check or force it immediately over ADB instead of waiting:

```bash
# Per-domain verification state; anything other than "verified" is the answer
adb shell pm get-app-links com.track1st.app

# Reset the cached state, then force re-verification (asynchronous)
adb shell pm set-app-links --package com.track1st.app 0 all
adb shell pm verify-app-links --re-verify com.track1st.app
```

Verification runs asynchronously, so allow a minute before re-reading the state. A `1024` state means verification ran and failed, typically a fingerprint mismatch.

The Android workflow enforces this: `scripts/verify-assetlinks-fingerprint.cjs` fails the build if the APK's signing fingerprint is not in `assetlinks.json`.

### Edge Functions Setup

Deploy all edge functions from the `supabase/functions/` directory using the Supabase CLI:

```bash
supabase functions deploy tmdb-proxy --project-ref <your-project-ref>
supabase functions deploy notify-new-content --project-ref <your-project-ref>
supabase functions deploy check-new-seasons --project-ref <your-project-ref>
supabase functions deploy sync-movie-releases --project-ref <your-project-ref>
supabase functions deploy sync-watch-providers --project-ref <your-project-ref>
supabase functions deploy get-upcoming-calendar --project-ref <your-project-ref>
supabase functions deploy audit-log --project-ref <your-project-ref>
supabase functions deploy device-fingerprint --project-ref <your-project-ref>
supabase functions deploy hcaptcha-verify --project-ref <your-project-ref>
supabase functions deploy hibp-check --project-ref <your-project-ref>
supabase functions deploy mfa-backup-codes --project-ref <your-project-ref>
supabase functions deploy push-log --project-ref <your-project-ref>
supabase functions deploy revoke-session --project-ref <your-project-ref>
supabase functions deploy verify-admin --project-ref <your-project-ref>
supabase functions deploy delete-account --project-ref <your-project-ref>
```

Set the required environment variables for edge functions:

```bash
supabase secrets set TMDB_API_KEY=<your-tmdb-api-key> --project-ref <your-project-ref>
```

If you want push notifications, also set:

```bash
supabase secrets set VAPID_PUBLIC_KEY=<your-vapid-public-key> --project-ref <your-project-ref>
supabase secrets set VAPID_PRIVATE_KEY=<your-vapid-private-key> --project-ref <your-project-ref>
```

### Cron Jobs Setup

The following scheduled jobs keep data fresh and send notifications. Each uses `pg_cron` to call the corresponding edge function via `pg_net`.

**1. Notification sweep (every 15 minutes)**

The sweep self-throttles per user (15 minutes between checks) and processes users least-recently-checked first within a per-invocation time budget, so running it every 15 minutes is safe and guarantees every due user gets served even when one sweep cannot check everyone:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'notify-new-content-sweep',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := 'https://<your-project-ref>.supabase.co/functions/v1/notify-new-content',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);
```

If you previously created the hourly job (`notify-new-content-hourly` at `5 * * * *`), replace it with the 15-minute schedule above:

```sql
select cron.unschedule('notify-new-content-hourly');
-- then run the cron.schedule(...) block above
```

**2. Movie release sync (every 6 hours)**

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-movie-releases',
  '0 */6 * * *',
  $job$
    select net.http_post(
      url := 'https://<your-project-ref>.supabase.co/functions/v1/sync-movie-releases',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);
```

**3. Watch provider sync (daily at 3 AM)**

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-watch-providers',
  '0 3 * * *',
  $job$
    select net.http_post(
      url := 'https://<your-project-ref>.supabase.co/functions/v1/sync-watch-providers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);
```

### Cron Secret Setup

The cron jobs send an `x-cron-secret` header that must match the `cron_secret` stored in the Supabase Vault extension. To set it up:

1. Set the Edge Function secret:

```bash
supabase secrets set CRON_SECRET=<random-secret> --project-ref <your-project-ref>
```

2. Store the same value in Vault:

```sql
SELECT vault.create_secret('cron_secret', '<same-random-secret>');
```

3. Verify:

```sql
SELECT name FROM vault.secrets WHERE name = 'cron_secret';
```

### CI Secrets

The Android workflow builds on every push to `main`. Credentials are read from
GitHub Secrets and restored at build time, so none of them live in this
repository.

Add these under **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | How to obtain it |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → Data API |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys (the publishable key, `sb_publishable_...`) |
| `SUPABASE_URL` | Same URL as `VITE_SUPABASE_URL` (used by the Storage upload step) |
| `SUPABASE_JWT_SECRET` | Supabase → Project Settings → API → JWT secret. The upload step signs a short-lived `service_role` JWT with it (`scripts/mint-service-token.cjs`), because the Storage API only accepts JWTs — the new-format `sb_secret_...` key is an opaque token it cannot parse. |
| `VITE_HCAPTCHA_SITE_KEY` | hCaptcha dashboard |
| `VITE_PUSH_VAPID_PUBLIC_KEY` | Supabase → Project Settings → API Keys → Web Push |
| `VITE_GOOGLE_WEB_CLIENT_ID` | Google Cloud Console → Credentials → the **Web application** client ID (ends in `.apps.googleusercontent.com`). Public by design: it ships in the bundle and is the ID token audience for Android sign-in. |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 android/app/upload.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | The password protecting that keystore |
| `GOOGLE_SERVICES_JSON_B64` | `base64 -w0 android/app/google-services.json` |

Notes:

- The legacy `SUPABASE_SERVICE_ROLE_KEY` secret is no longer used by CI. The legacy keys cannot be rotated, so once they are disabled the JWT-secret minting above replaces them permanently.
- The JWT secret can mint service_role tokens — treat it with the same care as the old service_role key and never expose it to the client bundle.

Notes:

- `VITE_TMDB_API_KEY` is deliberately **not** a CI secret. The browser never
  talks to TMDB directly — all requests are proxied through the `tmdb-proxy`
  edge function, which reads its key from the server-side `TMDB_API_KEY`
  environment variable. A `VITE_` key would be inlined into the public client
  bundle for nothing.
- `android/app/upload.keystore` and `android/app/google-services.json` are
  gitignored. The signing key is the credential that matters most here: anyone
  holding it can sign an APK that Android accepts as an update to an already
  installed copy of the app.
- The build fails immediately, with a `::error::` naming the missing secret,
  rather than producing an APK with blank configuration.

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/ph1lippus/trackist.git
cd trackist

# 2. Install dependencies
npm install

# 3. Set up the Supabase database
#    Run the SQL schema in sql.sql against your Supabase project
#    (or use the Supabase dashboard SQL editor)

# 4. Start the development server
npm run dev

# 5. Open http://localhost:5173
```

## Available Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build for production (includes TypeScript compilation) |
| `npm run lint` | Run ESLint across the codebase |
| `npm run preview` | Preview the production build locally |

## Database Schema

The project uses the following main tables in Supabase:

- **`watchlist`** — Main table storing movies and TV shows with status, progress, and metadata.
- **`watchlist_episodes`** — Stores individual watched episodes for TV shows, enabling per-episode tracking.
- **`profiles`** — User profile data (avatar, bio, preferences).
- **`push_subscriptions`** — Push notification endpoints for web and native push.
- **`notification_check_runs`** — Throttle tracking for notification cron runs.
- **`user_follows`** / **`list_follows`** — Social follow relationships.
- **`lists`** / **`list_items`** — Custom user-created lists.
- **`user_sessions`** — Session tracking for security.
- **`user_mfa_backup_codes`** — MFA backup codes.
- **`auth_audit_log`** — Authentication event logging.
- **`blocked_ips`** — IP blocking for security.

The full schema is in [`sql.sql`](sql.sql).

## Key Architecture Decisions

- **State Management**: Zustand (lightweight, no boilerplate) with selective state slicing for performance.
- **Caching**: TMDB API responses are cached client-side with a 6-hour TTL to minimize API calls.
- **Episode Tracking**: `current_episode` represents the episode number of the last watched episode in the current season (not a simple count), ensuring correct "next episode" calculations even with out-of-order viewing. The "Progress Fix" tool (`recalculateProgress`) reconciles discrepancies.
- **Mobile-First Card UI**: A dedicated mobile grid component provides an optimized touch experience with animated episode marking.
- **Notifications**: Separate cron jobs handle episode/season notifications, movie release sync, and watch provider updates. Movie notifications distinguish between theatrical and digital releases with clear labels and provider info.
- **Security**: Row Level Security (RLS) policies on all tables, MFA support, session management, and IP blocking.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run lint` and `npm run build` to verify
5. Submit a pull request

## License

MIT — see [LICENSE](LICENSE) for details.

## Author

Philipp (Ph1lippus) — [GitHub](https://github.com/ph1lippus)

---

This project is not affiliated with, endorsed by, or in any way connected to TMDB, Supabase, or Vercel beyond using their public APIs and services.

**TMDB attribution**: This product uses the TMDB API but is not endorsed or certified by TMDB. All movie and TV show data, images, and metadata displayed are sourced from [The Movie Database (TMDB)](https://www.themoviedb.org/).
