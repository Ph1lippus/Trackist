# Trackist

Track your movies, TV shows, and anime — all in one place. A modern, privacy-focused watchlist app built with React, TypeScript, and Supabase.

**This product uses the TMDB API but is not endorsed or certified by TMDB.**

## Features

- **User Authentication** — Secure sign-up, login, and password recovery via Supabase Auth.
- **Search** — Discover movies, TV shows, and anime by title, plus browse cast and crew details.
- **Watchlists** — Personal lists with public/private sharing. Mark shows/movies as planning, watching, completed, or caught up.
- **Episode Tracking** — For TV shows and anime, mark individual episodes as watched, unwatch them, and see your progress at a glance.
- **Statistics** — Visual insights into your watch history, including runtime totals, status breakdowns, and genre trends.
- **Responsive Design** — Dedicated mobile UI for on-the-go tracking, with a native-app-like experience.
- **PWA Support** — Install as a Progressive Web App and use it offline (data syncs on reconnect).
- **Addon Integration** — Open episodes directly in Stremio or other media players via deep links.
- **Progressive Episode Discovery** — Automatically detects when shows have new episodes and marks them as "watching" so you always know what to continue next.

## Screenshots

### Desktop

| Discover | TV Show Detail | Statistics |
| --- | --- | --- |
| ![Discover](https://track1st.vercel.app/og-image.png) | ![TV Show Detail](https://track1st.vercel.app/og-image.png) | ![Statistics](https://track1st.vercel.app/og-image.png) |

### Mobile

| TV Shows | Episode Marking | Credits |
| --- | --- | --- |
| ![Mobile TV Shows](https://track1st.vercel.app/og-image.png) | ![Episode Marking](https://track1st.vercel.app/og-image.png) | ![Credits](https://track1st.vercel.app/og-image.png) |

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | React 19, TypeScript, Vite, React Router v7, Zustand (state management) |
| **UI** | Bootstrap 5, Font Awesome, custom CSS (9,500+ lines) |
| **Backend & Database** | Supabase (PostgreSQL, Auth, Realtime) |
| **APIs** | [TMDB](https://www.themoviedb.org/documentation/api) (movies/TV/anime data), [FanArt](https://fanart.tv/) (backdrops/artwork) |
| **Performance** | React Virtuoso (virtualized lists), SWR-style caching with 6-hour TTL |
| **Deployment** | Vercel (with Speed Insights & Analytics) |
| **PWA** | vite-plugin-pwa (offline support, install prompt) |

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- A [TMDB API key](https://www.themoviedb.org/settings/api) (free)
- A [FanArt API key](https://fanart.tv/api/register) (free, optional — for backdrop images)
- A [Supabase project](https://supabase.com/) with the database schema set up

### Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_TMDB_API_KEY=your_tmdb_api_key
VITE_FANART_API_KEY=your_fanart_api_key
```

### Setup

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

The project uses three main tables in Supabase:

- **`watchlist`** — Main table storing movies, TV shows, and anime entries with status, progress, and metadata.
- **`watchlist_episodes`** — Stores individual watched episodes for TV shows and anime, enabling per-episode tracking.
- **`profiles`** — User profile data (avatar, bio, preferences).

The full schema is in [`sql.sql`](sql.sql).

## Key Architecture Decisions

- **State Management**: Zustand (lightweight, no boilerplate) with selective state slicing for performance.
- **Caching**: TMDB API responses are cached client-side with a 6-hour TTL to minimize API calls.
- **Episode Tracking**: `current_episode` represents the episode number of the last watched episode in the current season (not a simple count), ensuring correct "next episode" calculations even with out-of-order viewing. The "Progress Fix" tool (`recalculateProgress`) reconciles discrepancies.
- **Mobile-First Card UI**: A dedicated mobile grid component provides an optimized touch experience with animated episode marking.

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