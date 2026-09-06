import React from 'react'
import { usePageTitle } from '../hooks/usePageTitle'

const About: React.FC = () => {
    usePageTitle('Track1st - About')

    return (
        <main className="main">
            <div className="container settings-page">
                <div className="settings-panel settings-panel--subpage">
                    <div className="about-page">
                        <div className="about-hero">
                            <h1 className="settings-panel__title">About Track1st</h1>
                            <p className="settings-panel__subtitle">Your personal movie and TV show companion</p>
                        </div>

                        <div className="legal-page">
                            <section>
                                <h2>What is Track1st?</h2>
                                <p>
                                    Track1st is a modern, privacy-focused watchlist app that helps you track 
                                    movies and TV shows across multiple platforms. Built with React, TypeScript, 
                                    and Supabase, it offers a seamless experience for managing your entertainment queue.
                                </p>
                            </section>

                            <section>
                                <h2>Key Features</h2>
                                <ul>
                            <li><strong>Smart Watchlists</strong> — Organize movies and TV shows with custom statuses and progress tracking.</li>
                            <li><strong>Episode Tracking</strong> — Mark episodes as watched and see your progress at a glance.</li>
                            <li><strong>Push Notifications</strong> — Get notified when new episodes or releases drop.</li>
                            <li><strong>Provider Integration</strong> — See where content is streaming (Netflix, Prime, Disney+, etc.).</li>
                            <li><strong>Lists & Sharing</strong> — Create public or private lists and share them with friends.</li>
                            <li><strong>Statistics</strong> — Visual insights into your watching habits.</li>
                            <li><strong>Native App</strong> — Built with Capacitor for iOS and Android.</li>
                                </ul>
                            </section>

                            <section>
                                <h2>Open Source</h2>
                            <p>
                                Track1st is open-source and available on GitHub. 
                                The project follows transparent, community-driven development. 
                                Contributions, bug reports, and feature suggestions are welcome.
                            </p>
                            </section>

                            <section>
                                <h2>Privacy First</h2>
                            <p>
                                The app does not sell user data. Watchlist and personal information are protected 
                                by Row Level Security and users can delete their account at any time. 
                                Read the <a href="/privacy-policy">Privacy Policy</a> for details.
                            </p>
                            </section>

                            <section>
                                <h2>Technology</h2>
                            <p>
                                Built with React 19, TypeScript, Vite, and Supabase. 
                                TMDB powers the movie and TV data. 
                                Push notifications work via web push and native FCM where available.
                            </p>
                            </section>

                            <section>
                                <h2>Get In Touch</h2>
                                <p>
                                    Have feedback, questions, or want to contribute? 
                                    Reach out via <a href="/contact">Contact</a> or find us on GitHub.
                                </p>
                            </section>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default About
