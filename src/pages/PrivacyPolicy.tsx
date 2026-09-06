import React from 'react'
import { usePageTitle } from '../hooks/usePageTitle'

const PrivacyPolicy: React.FC = () => {
    usePageTitle('Track1st - Privacy Policy')

    return (
        <main className="main">
            <div className="container settings-page">
                <div className="settings-panel settings-panel--subpage">
                    <h1 className="settings-panel__title">Privacy Policy</h1>
                    <p className="settings-panel__subtitle">Last updated: September 2026</p>

                    <div className="legal-page">
                        <section>
                            <h2>Overview</h2>
                            <p>
                                Track1st is an open-source watchlist application. 
                                This policy describes what data the app stores, why it stores it, 
                                and who has access to it.
                            </p>
                        </section>

                        <section>
                            <h2>Data the app stores</h2>
                            <ul>
                                <li><strong>Account credentials</strong> — email address and password hash, managed by Supabase Auth.</li>
                                <li><strong>Profile information</strong> — display name and avatar URL chosen by the user.</li>
                                <li><strong>Watchlist entries</strong> — movies and TV shows added by the user, including watch status, episode progress, and personal notes.</li>
                                <li><strong>Lists</strong> — user-created lists and list items, if the user chooses to create them.</li>
                                <li><strong>Notification preferences</strong> — user settings for episode, season, and movie release notifications.</li>
                                <li><strong>Push subscriptions</strong> — browser or device endpoints if the user enables push notifications.</li>
                                <li><strong>MFA backup codes</strong> — hashed backup codes if the user enables multi-factor authentication.</li>
                                <li><strong>Session records</strong> — IP address, user agent, and device info for active sessions, used for security and session management.</li>
                            </ul>
                        </section>

                        <section>
                            <h2>Why the app stores this data</h2>
                            <ul>
                                <li>To authenticate users and keep accounts secure.</li>
                                <li>To maintain the user's watchlist, episode progress, and lists.</li>
                                <li>To send optional notifications about new episodes or releases.</li>
                                <li>To enforce rate limits and block abusive IP addresses.</li>
                            </ul>
                        </section>

                        <section>
                            <h2>Third-party services</h2>
                            <p>
                                The app relies on the following external services:
                            </p>
                            <ul>
                                <li><strong>Supabase</strong> — provides PostgreSQL database hosting, authentication, and edge function runtime. User data is stored in Supabase infrastructure.</li>
                                <li><strong>TMDB (The Movie Database)</strong> — provides movie and TV show metadata, posters, and release information. The app sends search and detail requests to TMDB's API.</li>
                            </ul>
                            <p>
                                These services have their own privacy policies. The app does not share user data with any other third parties.
                            </p>
                        </section>

                        <section>
                            <h2>Data security</h2>
                            <p>
                                The app uses Row Level Security (RLS) policies on the database to restrict data access. 
                                Authentication is handled by Supabase Auth. Passwords are not stored in the app's database. 
                                The app does not use analytics, advertising, or tracking scripts.
                            </p>
                        </section>

                        <section>
                            <h2>User controls</h2>
                            <p>
                                Users can delete their account at any time from Settings. Account deletion removes 
                                the user's profile, watchlist data, lists, push subscriptions, and session records 
                                from the database. This action is permanent.
                            </p>
                        </section>

                        <section>
                            <h2>Open source</h2>
                            <p>
                                Track1st is open-source under the MIT license. The source code is available on GitHub. 
                                Anyone can inspect how data is handled by reviewing the code.
                            </p>
                        </section>

                        <section>
                            <h2>Contact</h2>
                            <p>
                                For questions about this policy, open an issue on the GitHub repository.
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default PrivacyPolicy
