import React from 'react'

interface SkeletonCardProps {
    count?: number
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({ count = 8 }) => {
    return (
        <>
            {Array.from({ length: count }).map((_, index) => (
                <div key={index} className="skeleton-card-wrapper">
                    <div className="skeleton skeleton-card" />
                    <div className="skeleton skeleton-text skeleton-text--medium" />
                    <div className="skeleton skeleton-text skeleton-text--short" />
                </div>
            ))}
        </>
    )
}

export default SkeletonCard