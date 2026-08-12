export interface StatusFormat {
    label: string
    icon: string
    color: string
}

export const formatStatus = (status: string): StatusFormat => {
    const formats: Record<string, StatusFormat> = {
        planning: { label: 'Plan to Watch', icon: 'fa-regular fa-calendar', color: '#b0b0b0' },
        watching: { label: 'Watching', icon: 'fa-solid fa-play', color: '#ffc107' },
        completed: { label: 'Completed', icon: 'fa-solid fa-check', color: '#68ffae' },
        dropped: { label: 'Dropped', icon: 'fa-solid fa-xmark', color: '#f44336' },
        caught_up: { label: 'Caught up', icon: 'fa-solid fa-check-double', color: '#0096ff' },
        paused: { label: 'Paused', icon: 'fa-solid fa-pause', color: '#ff9800' },
    }
    return formats[status] || { label: status, icon: 'fa-solid fa-circle', color: '#b0b0b0' }
}
