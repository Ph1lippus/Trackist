import React from 'react'
import { usePageTitle } from '../hooks/usePageTitle'

// Legal notices need a monitored address that survives the project. Replace
// this with a real inbox you control before publishing.
const CONTACT_EMAIL = 'privacy@track1st.app'

const PrivacyPolicy: React.FC = () => {
    usePageTitle('Track1st - Privacy Policy')

    return (
        <main className="main">
            <div className="container settings-page">
                <div className="settings-panel settings-panel--subpage">
                    <h1 className="settings-panel__title">Privacy Policy</h1>
                    <p className="settings-panel__subtitle">Last updated: October 2026</p>

                    <div className="legal-page">
                        <section>
                            <h2>The short version</h2>
                            <p>
                                Track1st stores what it needs to run your watchlist: your account, what you
                                have added, and your progress. It does not show advertising, does not sell
                                your data, and does not run analytics or tracking scripts. Your raw IP
                                address is never stored — only a one-way hash of it, used to spot abuse.
                                You can delete your account and your data at any time from Settings.
                            </p>
                        </section>

                        <section>
                            <h2>Who is responsible for your data</h2>
                            <p>
                                Track1st is a free, open-source project run by its maintainers
                                ("we"). Your data is processed by us on the hosting and authentication
                                services listed under <strong>Who we share data with</strong>.
                            </p>
                        </section>

                        <section>
                            <h2>What we collect</h2>
                            <ul>
                                <li>
                                    <strong>Account details</strong> — your email address and a hashed
                                    password, managed by Supabase Auth. If you sign in with Google, your
                                    Google name, email address, and profile picture.
                                </li>
                                <li>
                                    <strong>Profile</strong> — the display name and avatar you choose,
                                    plus an optional bio. We also store the timezone and country you
                                    select, which are used to time notifications correctly. You are
                                    not asked for your legal name, street address, or phone number.
                                </li>
                                <li>
                                    <strong>Watchlist and progress</strong> — the movies and shows you add,
                                    your watch status, episode progress, and custom lists.
                                </li>
                                <li>
                                    <strong>Preferences</strong> — notification settings, display
                                    settings, and integration toggles you configure.
                                </li>
                                <li>
                                    <strong>Push notification subscriptions</strong> — the endpoint or
                                    device token used to deliver notifications you have opted into, plus
                                    a rough user agent string.
                                </li>
                                <li>
                                    <strong>Multi-factor authentication</strong> — if you enable it, we
                                    store hashed backup codes. We never store your authentication
                                    app secrets.
                                </li>
                                <li>
                                    <strong>Security records</strong> — for fraud and abuse prevention we
                                    keep an audit log of account events (sign-in, password change,
                                    and similar), the user agent and a device fingerprint associated
                                    with the session, and a risk score.
                                </li>
                                <li>
                                    <strong>Blocked addresses</strong> — a salted hash of IP addresses that
                                    have repeatedly failed rate limits, with a reason and expiry.
                                </li>
                            </ul>
                        </section>

                        <section>
                            <h2>What we deliberately do not collect</h2>
                            <ul>
                                <li>Your raw IP address. It is salted and hashed before storage, and cannot be reversed to an address.</li>
                                <li>Advertising identifiers, cross-app tracking tokens, or a behavioural profile.</li>
                                <li>Precise location, or any contact list, photos, or files from your device.</li>
                                <li>Your real name. A display name is optional and self-chosen.</li>
                            </ul>
                        </section>

                        <section>
                            <h2>Why we use it</h2>
                            <ul>
                                <li>To create and secure your account, including multi-factor authentication.</li>
                                <li>To store and sync your watchlist, progress, and lists across your devices.</li>
                                <li>To send notifications you have explicitly opted into.</li>
                                <li>To detect and block abuse, rate-limit automated traffic, and investigate suspicious sign-ins.</li>
                                <li>To comply with our legal obligations.</li>
                            </ul>
                        </section>

                        <section>
                            <h2>Who we share data with</h2>
                            <p>
                                We use the following services. Each one only receives what it needs to do
                                its job:
                            </p>
                            <ul>
                                <li>
                                    <strong>Supabase</strong> — database hosting, authentication, file
                                    storage, and edge functions. Your account and app data are stored
                                    here.
                                </li>
                                <li>
                                    <strong>Google</strong> — for "Continue with Google" sign-in, and for
                                    push notifications on Android via Firebase Cloud Messaging. Google
                                    receives your account identifier and push token.
                                </li>
                                <li>
                                    <strong>Vercel</strong> — hosts this website and serves the app. Vercel
                                    processes network information such as IP addresses in its own
                                    server logs.
                                </li>
                                <li>
                                    <strong>TMDB (The Movie Database)</strong> — provides movie and show
                                    metadata, images, and release dates. Requests are made through our
                                    server, so they are not tied to your account.
                                </li>
                                <li>
                                    <strong>hCaptcha</strong> — protects sign-up and sign-in on the
                                    <em>website</em> against bots. It receives your IP address and
                                    browser information. It is not used in the Android app, where
                                    challenges cannot be completed.
                                </li>
                                <li>
                                    <strong>Have I Been Pwned</strong> — if you enable breach checking,
                                    we query whether your email appears in a known data breach. Only
                                    your email address is sent.
                                </li>
                                <li>
                                    <strong>Stremio and Reddit</strong> — optional integrations you can
                                    enable. Stremio supplies availability metadata, and Reddit image
                                    previews are loaded directly from Reddit when a show references one.
                                </li>
                            </ul>
                            <p>
                                We do not sell your data, and we do not share it with advertisers or data
                                brokers. We may disclose information where required by law, or to protect
                                the rights and safety of the project and its users.
                            </p>
                        </section>

                        <section>
                            <h2>Analytics and cookies</h2>
                            <p>
                                The app and website contain no analytics, advertising, or tracking
                                scripts, and set no advertising or cross-site tracking cookies. A cookie
                                is used only to remember your session. If we ever introduce analytics,
                                this policy will be updated first and the change will be described here.
                            </p>
                        </section>

                        <section>
                            <h2>How we protect it</h2>
                            <ul>
                                <li>All traffic is encrypted in transit with HTTPS.</li>
                                <li>Database access is restricted by Row Level Security policies, so a leaked key cannot read another user's data.</li>
                                <li>Passwords are hashed by Supabase Auth and are never readable by us.</li>
                                <li>Data is served to the app only to the signed-in account that owns it.</li>
                            </ul>
                        </section>

                        <section>
                            <h2>How long we keep it</h2>
                            <p>
                                Your account and app data are kept until you delete your account. Security
                                and audit records are retained for a limited period for security and legal
                                purposes. Blocked-address hashes expire automatically.
                            </p>
                        </section>

                        <section>
                            <h2>Your rights</h2>
                            <p>
                                Depending on where you live, you may have the right to access, correct,
                                export, or delete your personal data, or to object to or restrict its
                                processing. You can correct your profile and delete your account directly
                                from Settings. For anything else, email{' '}
                                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will
                                respond. We do not discriminate against users for exercising these rights.
                            </p>
                        </section>

                        <section>
                            <h2>Deleting your account</h2>
                            <p>
                                You can delete your account at any time from <strong>Settings → Delete
                                Account</strong>. Deletion requests your account and its associated data —
                                profile, watchlist entries, progress, lists, preferences, and push
                                subscriptions — be removed from our database. This cannot be undone, so
                                make sure you have a backup of anything you want to keep first.
                            </p>
                        </section>

                        <section>
                            <h2>Children</h2>
                            <p>
                                Track1st is not directed at children under 13, or the minimum age of
                                digital consent in your country. We do not knowingly collect data from
                                children below that age. If you believe a child has created an account,
                                contact us and we will remove it.
                            </p>
                        </section>

                        <section>
                            <h2>Open source</h2>
                            <p>
                                The application code is open source under the MIT licence and can be
                                reviewed on GitHub. This lets anyone check how the app handles your
                                data, including the database policies and the code that runs on our
                                servers. Note that our hosting credentials are not part of the public
                                repository.
                            </p>
                        </section>

                        <section>
                            <h2>Changes to this policy</h2>
                            <p>
                                If we change this policy we will update the date at the top of this page.
                                Material changes will be announced in the app. Continuing to use Track1st
                                after a change means you accept the updated policy.
                            </p>
                        </section>

                        <section>
                            <h2>Contact</h2>
                            <p>
                                For any privacy question, or to exercise a right described above, email{' '}
                                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default PrivacyPolicy