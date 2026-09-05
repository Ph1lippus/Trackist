import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
    children: ReactNode
    resetKey?: string | number
}

interface ErrorBoundaryState {
    hasError: boolean
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    override state: ErrorBoundaryState = { hasError: false }

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true }
    }

    override componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[ErrorBoundary] uncaught render error:', error, info.componentStack)
    }

    override componentDidUpdate(prevProps: ErrorBoundaryProps): void {
        if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ hasError: false })
        }
    }

    override render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div className="detail-page-error" role="alert">
                    <div className="error-boundary__card">
                        <h2>Something went wrong</h2>
                        <p>A rendering error occurred while loading this content.</p>
                        <button className="detail-page__retry-btn" onClick={() => window.location.reload()}>
                            Reload page
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary