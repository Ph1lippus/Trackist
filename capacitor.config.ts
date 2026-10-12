import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.track1st.app',
  appName: 'Track1st',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // Google sign-in on Android uses Credential Manager (the account picker
    // already in the phone), so the app needs no browser round-trip for auth.
    // Every other provider is switched off: they are unused, and Facebook in
    // particular would pull in the AD_ID permission this app never needs.
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
        linkedin: false,
        tiktok: false,
        telegram: false,
      },
      logLevel: 1,
    },
    PushNotifications: {
      presentationOptions: ['alert', 'badge', 'banner', 'list', 'sound'],
    },
    StatusBar: {
      overlaysWebView: true,
      backgroundColor: '#00000000',
      style: 'LIGHT',
    },
  },
}

export default config