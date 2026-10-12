#!/usr/bin/env node
'use strict'

/**
 * Guards the Android App Links association against signing-key drift.
 *
 * Shared links (https://track1st.vercel.app/...) only open inside the app
 * when Android can verify that the domain is handled by an app signed with a
 * certificate listed in /.well-known/assetlinks.json. That check happens at
 * install time and fails silently: a stale fingerprint does not break the
 * build, it just sends every shared link to the browser.
 *
 * The keystore was regenerated once already, which left the published
 * fingerprint pointing at a certificate no longer in use. This turns that
 * silent failure into a loud one.
 *
 * Usage:
 *   node scripts/verify-assetlinks-fingerprint.cjs "AA:BB:...:FF"
 *
 * Exits 0 when every supplied fingerprint is associated with the app,
 * 1 otherwise (after printing the exact fingerprint to add).
 */

const fs = require('fs')
const path = require('path')

const ASSETLINKS_PATH = path.join(__dirname, '..', 'public', '.well-known', 'assetlinks.json')
const PACKAGE_NAME = 'com.track1st.app'

/** keytool prints "SHA256: AA:BB:.."; normalise to the colon-cased form Android expects. */
const normalise = (fingerprint) =>
    String(fingerprint)
        .replace(/^SHA-?256[\s:,]*/i, '')
        .replace(/[^0-9a-fA-F]/g, '')
        .toUpperCase()
        .match(/.{2}/g)
        ?.join(':') ?? ''

const readAssociatedFingerprints = (assetlinksPath) => {
    const parsed = JSON.parse(fs.readFileSync(assetlinksPath, 'utf8'))
    if (!Array.isArray(parsed)) {
        throw new Error(`${assetlinksPath} must contain a JSON array of statements.`)
    }

    return new Set(
        parsed
            .filter(
                (statement) =>
                    statement?.target?.namespace === 'android_app' &&
                    statement?.target?.package_name === PACKAGE_NAME &&
                    Array.isArray(statement?.target?.sha256_cert_fingerprints),
            )
            .flatMap((statement) => statement.target.sha256_cert_fingerprints.map(normalise))
            .filter(Boolean),
    )
}

const main = () => {
    const supplied = process.argv.slice(2).map(normalise).filter(Boolean)

    if (!supplied.length) {
        console.error('::error::No signing fingerprint supplied.')
        console.error(
            '::error::Usage: node scripts/verify-assetlinks-fingerprint.cjs "<SHA256 fingerprint>"',
        )
        process.exit(1)
    }

    const associated = readAssociatedFingerprints(ASSETLINKS_PATH)
    const missing = supplied.filter((fingerprint) => !associated.has(fingerprint))

    if (!missing.length) {
        console.log(`App Links: ${PACKAGE_NAME} is associated with every supplied fingerprint.`)
        return
    }

    console.error('::error::App Links association is stale: the APK is signed with a certificate that')
    console.error(`::error::public/.well-known/assetlinks.json does not list for ${PACKAGE_NAME}.`)
    console.error('::error::Shared links will keep opening in the browser until this is fixed.')
    console.error('::error::Add this fingerprint to public/.well-known/assetlinks.json, then redeploy:')
    missing.forEach((fingerprint) => console.error(`::error::    "${fingerprint}"`))
    console.error('::error::Users pick this up on the next install or update; Android 15+ also')
    console.error('::error::re-verifies in the background. Use `adb shell pm verify-app-links')
    console.error('::error::--re-verify com.track1st.app` to check a device immediately.')
    process.exit(1)
}

main()