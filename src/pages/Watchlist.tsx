import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { imageUrl } from '../services/tmdbService'
import type { WatchlistItem } from '../types'

const Watchlist: React.FC = () => {
    const [items, setItems] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchWatchlist = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setLoading(false)
                return
            }

            const { data, error } = await supabase
                .from('watchlist')
                .select('*')
                .eq('user_id', user.id)
                .order('added_at', { ascending: false })

            if (!error) setItems(data || [])
            setLoading(false)
        }
        fetchWatchlist()
    }, [])

    const removeItem = async (id: string) => {
        if (!confirm('Remove from watchlist?')) return
        const { error } = await supabase.from('watchlist').delete().eq('id', id)
        if (!error) setItems(items.filter(item => item.id !== id))
    }

    if (loading) return <section className="dashboard-page"><div>Loading...</div></section>

    return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Your Watchlist</h2>
                        <span>{items.length} items saved</span>
                    </div>

                    {items.length === 0 ? (
                        <p style={{ opacity: 0.6, textAlign: 'center', padding: '2rem' }}>
                            Your watchlist is empty. Start adding movies and shows!
                        </p>
                    ) : (
                        <div className="dashboard-card-grid">
                            {items.map((item) => (
                                <article className="dashboard-card" key={item.id}>
                                    <img
                                        src={imageUrl(item.poster_path ?? null) || '/placeholder.png'}
                                        alt={item.title}
                                        className="dashboard-card__art"
                                        style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '8px 8px 0 0' }}
                                    />
                                    <div className="dashboard-card__body">
                                        <h3>{item.title}</h3>
                                        <p>{item.media_type} · {item.status}</p>
                                        <p>{item.overview?.slice(0, 60)}...</p>
                                        <button
                                            className="btn btn-danger btn-sm w-100 mt-2"
                                            onClick={() => removeItem(item.id)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

export default Watchlist