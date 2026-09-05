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
}

const CastList: React.FC<CastListProps> = ({ cast, isInModal }) => {
    const navigate = useNavigate()

    if (cast.length === 0) return null

    return (
        <div className="detail-page__cast-section">
            <div className="detail-page__cast-list">
                {cast.map((c) => (
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
                        {c.profile_path && (
                            <img
                                className="detail-page__cast-photo"
                                src={imageUrl(c.profile_path, 'w185') ?? ''}
                                alt={c.name ?? ''}
                                loading="lazy"
                                width="40"
                                height="40"
                            />
                        )}
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