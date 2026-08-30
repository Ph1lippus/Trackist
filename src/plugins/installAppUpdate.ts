import { registerPlugin } from '@capacitor/core'

export interface InstallAppUpdateInfo {
  path: string
  fileName?: string
}

export interface InstallAppUpdatePlugin {
  install(options: InstallAppUpdateInfo): Promise<{ value: boolean }>
}

const InstallAppUpdate = registerPlugin<InstallAppUpdatePlugin>('InstallAppUpdate', {
  web: () => ({
    async install() {
      throw new Error('App installation is only supported on Android native builds.')
    },
  }),
})

export const installAppUpdate = async (options: InstallAppUpdateInfo): Promise<void> => {
  await InstallAppUpdate.install(options)
}
