import re

path = r'C:\Users\filip\Desktop\Trackist\src\pages\MobileTVShows.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    # Add imports after markEpisodeWatched
    if line.strip() == "import { markEpisodeWatched } from '../services/watchlistService'"":
        new_lines.append("import { markEpisodeWatched, getNextEpisodeToWatch } from '../services/watchlistService'\n")
        new_lines.append("import { supabase } from '../services/supabaseClient'\n")
        continue
    
    # Add state after addingEpisode
    if line.strip() == "const [addingEpisode, setAddingEpisode] = useState<string | null>(null)"":
        new_lines.append(line)
        new_lines.append("    const [nextEpisodes, setNextEpisodes] = useState<Record<string, { season_number: number; episode_number: number }>>({})\n")
        new_lines.append("    const [loadingNextEpisodes, setLoadingNextEpisodes] = useState(false)\n")
        continue
    
    # Add fetchNextEpisodes effect before getEpisodeLabel
    if line.strip() == "// Get the episode label for a show"":
        new_lines.append("    useEffect(() => {\n")
        new_lines.append("        const fetchNextEpisodes = async () => {\n")
        new_lines.append("            if (watching.length === 0) return\n")
        new_lines.append("            setLoadingNextEpisodes(true)\n")
        new_lines.append("            try {\n")
        new_lines.append("                const watchlistIds = watching.map(s => s.id).filter((id): id is string => !!id)\n")
        new_lines.append("                if (watchlistIds.length === 0) {\n")
        new_lines.append("                    setLoadingNextEpisodes(false)\n")
        new_lines.append("                    return\n")
        new_lines.append("                }\n")
        new_lines.append("                const { data, error } = await supabase\n")
        new_lines.append("                    .from('watchlist_episodes')\n")
        new_lines.append("                    .select('watchlist_id, season_number, episode_number')\n")
        new_lines.append("                    .in('watchlist_id', watchlistIds)\n")
        new_lines.append("                    .eq('watched', false)\n")
        new_lines.append("                    .order('season_number', { ascending: true })\n")
        new_lines.append("                    .order('episode_number', { ascending: true })\n")
        new_lines.append("                if (!error && data) {\n")
        new_lines.append("                    const nextMap: Record<string, { season_number: number; episode_number: number }> = {}\n")
        new_lines.append("                    for (const row of data) {\n")
        new_lines.append("                        if (!nextMap[row.watchlist_id]) {\n")
        new_lines.append("                            nextMap[row.watchlist_id] = {\n")
        new_lines.append("                                season_number: row.season_number,\n")
        new_lines.append("                                episode_number: row.episode_number\n")
        new_lines.append("                            }\n")
        new_lines.append("                        }\n")
        new_lines.append("                    }\n")
        new_lines.append("                    setNextEpisodes(nextMap)\n")
        new_lines.append("                }\n")
        new_lines.append("            } catch (err) {\n")
        new_lines.append("                console.error('Failed to fetch next episodes:', err)\n")
        new_lines.append("            } finally {\n")
        new_lines.append("                setLoadingNextEpisodes(false)\n")
        new_lines.append("            }\n")
        new_lines.append("        }\n")
        new_lines.append("        fetchNextEpisodes()\n")
        new_lines.append("    }, [watching])\n")
        new_lines.append("\n")
        continue
    
    # Fix getEpisodeLabel to use cached next episodes
    if line.strip() == "// current_episode is now the episode number WITHIN the current season"":
        new_lines.append(line)
        new_lines.append("    // Uses the cached next episode from watchlist_episodes when available,\n")
        new_lines.append("    // so season transitions are handled correctly (e.g. S02E10 -> S03E01)\n")
        continue
    
    if line.strip() == "const currentSeason = show.current_season || 1"":
        new_lines.append("        const cached = nextEpisodes[show.id]\n")
        new_lines.append("        if (cached) {\n")
        new_lines.append("            return \`S\${cached.season_number} E\${cached.episode_number}\`\n")
        new_lines.append("        }\n")
        new_lines.append(line)
        continue
    
    if line.strip() == "return \`S\${currentSeason} E\${nextEpisode}\`"":
        continue  # skip old return
    
    # Fix handleAddEpisode to use cached next episode
    if line.strip() == "// Only NOW do we fetch the next episode details from TMDB"":
        new_lines.append("            // Use the cached next episode if available, otherwise fetch from TMDB\n")
        continue
    
    if line.strip() == "const { getNextEpisodeToWatch } = await import('../services/watchlistService')"":
        new_lines.append("            const cached = nextEpisodes[show.id]\n")
        new_lines.append("            let nextEp: { season_number: number; episode_number: number; tmdb_episode_id?: number; title?: string; still_path?: string; overview?: string; air_date?: string; runtime?: number } | null = null\n")
        new_lines.append("            if (cached) {\n")
        new_lines.append("                const { getTVSeasonDetails } = await import('../services/tmdbService')\n")
        new_lines.append("                const seasonData = await getTVSeasonDetails(show.tmdb_id, cached.season_number)\n")
        new_lines.append("                const ep = seasonData.episodes?.find(e => e.episode_number === cached.episode_number)\n")
        new_lines.append("                if (ep) {\n")
        new_lines.append("                    nextEp = {\n")
        new_lines.append("                        season_number: cached.season_number,\n")
        new_lines.append("                        episode_number: cached.episode_number,\n")
        new_lines.append("                        tmdb_episode_id: ep.id,\n")
        new_lines.append("                        title: ep.name,\n")
        new_lines.append("                        still_path: ep.still_path,\n")
        new_lines.append("                        overview: ep.overview,\n")
        new_lines.append("                        air_date: ep.air_date,\n")
        new_lines.append("                        runtime: ep.runtime\n")
        new_lines.append("                    }\n")
        new_lines.append("                }\n")
        new_lines.append("            }\n")
        new_lines.append("            if (!nextEp) {\n")
        new_lines.append(line)
        new_lines.append("                nextEp = await getNextEpisodeToWatch(show.id)\n")
        new_lines.append("            }\n")
        continue
    
    new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Done')
