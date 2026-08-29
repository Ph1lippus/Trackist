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
  },
}

export default config