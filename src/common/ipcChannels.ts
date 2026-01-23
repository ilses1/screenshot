export const IPC_CHANNELS = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  CAPTURE_SAVE_IMAGE: 'capture:save-image',
  HISTORY_LIST: 'history:list',
  HISTORY_CLEAR: 'history:clear',
  PIN_LAST: 'pin:last'
} as const

export type IpcChannelKeys = keyof typeof IPC_CHANNELS
export type IpcChannel = (typeof IPC_CHANNELS)[IpcChannelKeys]

