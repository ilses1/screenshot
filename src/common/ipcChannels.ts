export const IPC_CHANNELS = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  CAPTURE_SAVE_IMAGE: 'capture:save-image',
  CAPTURE_SESSION_STATE: 'capture:session-state',
  CAPTURE_SESSION_REPORT: 'capture:session-report',
  CAPTURE_MASK_INIT: 'capture:mask-init',
  CAPTURE_SELECTION_UPDATE: 'capture:selection-update',
  CAPTURE_SELECTION_BROADCAST: 'capture:selection-broadcast',
  CAPTURE_CONFIRM_REQUEST: 'capture:confirm-request',
  CAPTURE_ERROR: 'capture:error',
  CAPTURE_CLOSE: 'capture:close',
  HISTORY_LIST: 'history:list',
  HISTORY_CLEAR: 'history:clear',
  PIN_LAST: 'pin:last'
} as const

export type IpcChannelKeys = keyof typeof IPC_CHANNELS
export type IpcChannel = (typeof IPC_CHANNELS)[IpcChannelKeys]
