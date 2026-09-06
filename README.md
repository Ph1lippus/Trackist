# Trackist

Track your movies and TV shows — all in one place. A modern, privacy-focused watchlist app built with React, TypeScript, and Supabase.

**This product uses the TMDB API but is not endorsed or certified by TMDB.**

## Features

- **User Authentication** — Secure sign-up, login, and password recovery via Supabase Auth.
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

**1. Notification sweep (hourly)**

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'notify-new-content-hourly',
  '5 * * * *',
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
