import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { imageUrl } from '../services/tmdbService'
import useDetailModalStore from '../stores/detailModalStore'

export interface CastMember {
    id: number
    name: string
    character?: string | null
    profile_path?: string | null
    order?: number
}

interface CastListProps {
    cast: CastMember[]
    isInModal: boolean
    maxItems?: number
}

const CastList: React.FC<CastListProps> = ({ cast, isInModal, maxItems = 16 }) => {
    const navigate = useNavigate()

    if (cast.length === 0) return null

    // Safety net: never render photo-less cast members even if a caller fails to
    // curate the list before passing it in.
    const visibleCast = cast.filter((c) => c.profile_path)

    if (visibleCast.length === 0) return null

    // Hard cap: only the top-billed members are shown. Full cast is available
    // via the TMDB link on the detail page or a search.
    const displayCast = maxItems > 0 ? visibleCast.slice(0, maxItems) : visibleCast

    return (
        <div className="detail-page__cast-section">
            <div className="detail-page__cast-list">
                {displayCast.map((c) => (
                    <a
                        key={c.id}
                        className="detail-page__cast-item"
                        href={`/person/${c.id}`}
                        onClick={(e) => {
                            e.preventDefault()
                            if (isInModal) {
                                useDetailModalStore.getState().open('person', c.id)
                            } else {
                                navigate(`/person/${c.id}`)
                            }
                        }}
                    >
                        <img
                            className="detail-page__cast-photo"
                            src={imageUrl(c.profile_path, 'w92') ?? ''}
                            srcSet={`${imageUrl(c.profile_path, 'w92')} 92w, ${imageUrl(c.profile_path, 'w185')} 185w`}
                            sizes="60px"
                            alt={c.name ?? ''}
                            loading="lazy"
                            decoding="async"
                            width="60"
                            height="60"
                        />
                        <div className="detail-page__cast-info">
                            <span className="detail-page__cast-name">{c.name}</span>
                            {c.character && (
                                <span className="detail-page__cast-character">{c.character}</span>
                            )}
                        </div>
                    </a>
                ))}
            </div>
        </div>
    )
}

export default memo(CastList)