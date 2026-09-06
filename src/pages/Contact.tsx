import React from 'react'
import { usePageTitle } from '../hooks/usePageTitle'

const Contact: React.FC = () => {
    usePageTitle('Track1st - Contact')

    return (
        <main className="main">
            <div className="container settings-page">
                <div className="settings-panel settings-panel--subpage">
                    <h1 className="settings-panel__title">Contact</h1>
                    <p className="settings-panel__subtitle">
                        Have a question, bug report, or feature request? Reach out on GitHub.
                    </p>

                    <div className="contact-page">
                        <a
                            className="auth-submit-btn"
                            href="https://github.com/Ph1lippus"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Open GitHub
                        </a>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default Contact
