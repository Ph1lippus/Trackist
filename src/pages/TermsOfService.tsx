import React from 'react'
import { usePageTitle } from '../hooks/usePageTitle'

const TermsOfService: React.FC = () => {
    usePageTitle('Track1st - Terms of Service')

    return (
        <main className="main">
            <div className="container settings-page">
                <div className="settings-panel settings-panel--subpage">
                    <h1 className="settings-panel__title">Terms of Service</h1>
                    <p className="settings-panel__subtitle">Last updated: September 2026</p>

                    <div className="legal-page">
                        <section>
                            <h2>Description of service</h2>
                            <p>
                                Track1st is a free, open-source watchlist application. 
                                The app lets users track movies and TV shows, mark episodes as watched, 
                                and receive notifications about upcoming releases. 
                                The service is provided as-is, with no guarantees of uptime or data persistence.
                            </p>
                        </section>

                        <section>
                            <h2>User accounts</h2>
                            <p>
                                Users must create an account to use the app. Users are responsible for 
                                maintaining the confidentiality of their credentials and for all activity 
                                that occurs under their account.
                            </p>
                        </section>

                        <section>
                            <h2>Acceptable use</h2>
                            <p>Users agree not to:</p>
                            <ul>
                                <li>Use the service for any illegal or unauthorized purpose.</li>
                                <li>Attempt to gain unauthorized access to the app, its database, or other user accounts.</li>
                                <li>Interfere with or disrupt the integrity or performance of the service.</li>
                                <li>Use automated means to access or scrape the service without permission.</li>
                                <li>Post or share content that violates applicable laws or regulations.</li>
                            </ul>
                        </section>

                        <section>
                            <h2>Intellectual property</h2>
                            <p>
                                All movie and TV show metadata, images, and related content are provided by TMDB 
                                and remain the property of their respective owners. Track1st does not claim ownership 
                                over any TMDB content. The Track1st application code is open-source and licensed under MIT.
                            </p>
                        </section>

                        <section>
                            <h2>Disclaimers</h2>
                            <p>
                                The service is provided "as is" without warranties of any kind, either express or implied. 
                                The maintainers do not guarantee that the service will be uninterrupted, secure, or error-free. 
                                Release dates, episode availability, and provider information are sourced from TMDB and may be inaccurate or delayed.
                            </p>
                        </section>

                        <section>
                            <h2>Limitation of liability</h2>
                            <p>
                                To the fullest extent permitted by law, the maintainers shall not be liable for any 
                                indirect, incidental, special, consequential, or punitive damages resulting from 
                                the use or inability to use the service.
                            </p>
                        </section>

                        <section>
                            <h2>Account termination</h2>
                            <p>
                                The maintainers reserve the right to suspend or terminate accounts that violate 
                                these terms or abuse the service. Users may delete their account at any time from Settings.
                            </p>
                        </section>

                        <section>
                            <h2>Changes to terms</h2>
                            <p>
                                The maintainers may update these terms as the app evolves. Continued use of the 
                                service after changes constitutes acceptance of the updated terms. 
                                Users should review this page periodically.
                            </p>
                        </section>

                        <section>
                            <h2>Contact</h2>
                            <p>
                                For questions about these terms, open an issue on the GitHub repository.
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default TermsOfService
