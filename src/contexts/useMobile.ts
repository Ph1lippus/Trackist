import { useContext } from 'react'
import { MobileContext } from './MobileContext'

export const useMobile = () => {
    return useContext(MobileContext)
}
