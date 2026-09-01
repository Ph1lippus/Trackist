import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.track1st.app',
  appName: 'Track1st',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['alert', 'badge', 'banner', 'list', 'sound'],
    },
    StatusBar: {
      overlaysWebView: true,
      backgroundColor: '#2c2b55',
      style: 'LIGHT',
    },
  },
}

export default config