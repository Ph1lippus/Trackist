import React from 'react'
import { usePageTitle } from '../hooks/usePageTitle'

// Legal notices need a monitored address that survives the project. Replace
// this with a real inbox you control before publishing.
const CONTACT_EMAIL = 'legal@track1st.app'

const TermsOfService: React.FC = () => {
    usePageTitle('Track1st - Terms of Service')

    return (
        <main className="main">
            <div className="container settings-page">
                <div className="settings-panel settings-panel--subpage">
                    <h1 className="settings-panel__title">Terms of Service</h1>
                    <p className="settings-panel__subtitle">Last updated: October 2026</p>

                    <div className="legal-page">
                        <section>
                            <h2>About this service</h2>
                            <p>
                                Track1st ("the app", "the service") is a free, open-source application for
                                tracking movies and TV shows. The people who maintain it are referred to
                                as "we", "us", or "maintainers"; people using the app are "you" or
                                "users".
                            </p>
                            <p>
                                The app lets you build a watchlist, mark episodes as watched, and
                                optionally receive notifications about new episodes and releases. It is
                                provided free of charge, with no paid tier.
                            </p>
                        </section>

                        <section>
                            <h2>Accepting these terms</h2>
                            <p>
                                By creating an account or using the app, you agree to these terms and to
                                our <a href="/privacy-policy">Privacy Policy</a>. If you do not agree,
                                do not use the app.
                            </p>
                        </section>

                        <section>
                            <h2>Your account</h2>
                            <ul>
                                <li>You need an account to use the app. You can create one with an email address and password or through Google sign-in.</li>
                                <li>You are responsible for keeping your credentials secure and for everything that happens under your account.</li>
                                <li>You must be old enough to consent to data processing in your country, and at least 13 years old. See the Privacy Policy for details.</li>
                                <li>You must provide accurate information and keep it up to date.</li>
                                <li>One person or household per account. Sharing accounts makes rate limiting and abuse detection unreliable for everyone.</li>
                            </ul>
                        </section>

                        <section>
                            <h2>Acceptable use</h2>
                            <p>You agree not to:</p>
                            <ul>
                                <li>Use the app for any unlawful purpose, or to violate any applicable law or regulation.</li>
                                <li>Attempt to access the app, its database, its servers, or another user's account without authorisation, or probe for vulnerabilities without our written permission.</li>
                                <li>Interfere with, disrupt, or degrade the service, including through denial-of-service, automated load, or circumventing rate limits.</li>
                                <li>Scrape, bulk-download, or access the service by automated means without our written permission.</li>
                                <li>Misrepresent your identity or ownership of content.</li>
                                <li>Resell, rebrand, or redistribute the app as your own, except under the terms of the MIT licence.</li>
                            </ul>
                        </section>

                        <section>
                            <h2>Your content and licence</h2>
                            <p>
                                You keep ownership of the watchlist entries, lists, and notes you create.
                                You grant us only the narrow licence needed to host, back up, and display
                                that content to you and, where you choose, to others you share it with.
                                You can export or delete your data at any time.
                            </p>
                        </section>

                        <section>
                            <h2>Intellectual property</h2>
                            <p>
                                The Track1st application code is open source and licensed under the MIT
                                licence. Movie and TV show metadata, posters, trailers, and related
                                content are provided by TMDB and remain the property of their respective
                                owners. This product uses the TMDB API but is not endorsed or certified by
                                TMDB. Third-party integrations remain the property of their respective
                                owners.
                            </p>
                        </section>

                        <section>
                            <h2>Availability and changes</h2>
                            <p>
                                The service is provided on a best-effort basis. We do not guarantee uptime
                                or that your data will be stored indefinitely, and we may modify, suspend,
                                or discontinue features at any time. Android updates are delivered as an
                                APK; you are responsible for installing them.
                            </p>
                        </section>

                        <section>
                            <h2>Termination</h2>
                            <p>
                                You may stop using the app and delete your account at any time from
                                Settings. We may suspend or terminate accounts that breach these terms,
                                or where required by law. Where we terminate an account for cause, we will
                                explain the reason unless doing so would compromise security or the law.
                            </p>
                        </section>

                        <section>
                            <h2>Disclaimers</h2>
                            <p>
                                The service is provided "as is" and "as available", without warranties of
                                any kind, express or implied, including fitness for a particular purpose.
                                We do not warrant that the service will be uninterrupted, secure, or
                                error-free. Release dates, episode availability, and streaming provider
                                information are sourced from third parties such as TMDB and may be
                                inaccurate, delayed, or out of date.
                            </p>
                        </section>

                        <section>
                            <h2>Limitation of liability</h2>
                            <p>
                                To the fullest extent permitted by law, we are not liable for any
                                indirect, incidental, special, consequential, or punitive damages, or for
                                any loss of data, profit, or goodwill, arising from your use of, or
                                inability to use, the service. Nothing in these terms limits liability
                                that cannot lawfully be limited.
                            </p>
                        </section>

                        <section>
                            <h2>Indemnity</h2>
                            <p>
                                To the extent permitted by law, you agree to indemnify and hold harmless
                                the maintainers from any claim arising from your use of the app, your
                                breach of these terms, or your violation of any third party's rights.
                            </p>
                        </section>

                        <section>
                            <h2>Governing law</h2>
                            <p>
                                These terms are governed by the laws applicable in the maintainer's
                                jurisdiction, without regard to conflict of law rules. Nothing in these
                                terms removes rights you have under the mandatory consumer law of your
                                country of residence.
                            </p>
                        </section>

                        <section>
                            <h2>Changes to these terms</h2>
                            <p>
                                We may update these terms as the app evolves. We will update the date at
                                the top of this page, and announce material changes in the app. If you do
                                not accept the updated terms, you should stop using the app and delete
                                your account.
                            </p>
                        </section>

                        <section>
                            <h2>Contact</h2>
                            <p>
                                Questions about these terms, or notices that need to reach us formally,
                                can be sent to{' '}
                                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. For bugs and
                                feature requests, the GitHub repository is usually faster.
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default TermsOfService