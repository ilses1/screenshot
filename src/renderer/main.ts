 import type { AppConfig, ScreenshotRecord } from '../common/types'

declare global {
  interface Window {
    api: {
      ping: () => string
      getSettings: () => Promise<AppConfig>
      updateSettings: (patch: Partial<AppConfig>) => Promise<AppConfig>
      getHistory: () => Promise<ScreenshotRecord[]>
      clearHistory: () => Promise<void>
      pinLast: () => Promise<void>
    }
  }
}

 const app = document.getElementById('app')!
 
 function renderSettingsUI() {
  app.innerHTML = `
  <main style="font-family: system-ui, sans-serif; padding: 24px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <h1 style="font-size: 24px; margin-bottom: 16px;">截图工具设置</h1>
    <section style="margin-bottom: 16px;">
      <label style="display: block; margin-bottom: 8px;">
        截图快捷键：
        <input id="hotkey-input" style="margin-left: 8px; padding: 4px 8px; width: 160px;" placeholder="例如 F2 或 Ctrl+Shift+F2" />
      </label>
    </section>
    <section style="margin-bottom: 16px;">
      <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <input id="auto-save-input" type="checkbox" />
        截图后自动保存到文件
      </label>
      <label style="display: block; margin-bottom: 8px;">
        保存目录：
        <input id="save-dir-input" style="margin-left: 8px; padding: 4px 8px; width: 320px;" />
      </label>
      <label style="display: flex; align-items: center; gap: 8px;">
        <input id="open-editor-input" type="checkbox" />
        截图后自动打开编辑器
      </label>
    </section>
    <button id="save-button" style="padding: 6px 12px;">保存设置</button>
    <span id="status-text" style="margin-left: 12px; color: #16a34a;"></span>

    <section style="margin-top: 24px;">
      <h2 style="font-size: 18px; margin-bottom: 8px;">截图历史</h2>
      <div style="margin-bottom: 8px; display: flex; gap: 8px;">
        <button id="refresh-history-button" style="padding: 4px 8px;">刷新</button>
        <button id="clear-history-button" style="padding: 4px 8px;">清空历史</button>
        <button id="pin-last-button" style="padding: 4px 8px;">贴最近截图</button>
      </div>
      <ul id="history-list" style="list-style: none; padding: 0; margin: 0;"></ul>
    </section>
   </main>
 `
 }

 function getElements() {
   const hotkeyInput = document.getElementById('hotkey-input') as HTMLInputElement
   const autoSaveInput = document.getElementById(
  'auto-save-input'
) as HTMLInputElement
   const saveDirInput = document.getElementById(
  'save-dir-input'
) as HTMLInputElement
   const openEditorInput = document.getElementById(
  'open-editor-input'
) as HTMLInputElement
   const saveButton = document.getElementById('save-button') as HTMLButtonElement
   const statusText = document.getElementById('status-text') as HTMLSpanElement
   const historyList = document.getElementById('history-list') as HTMLUListElement
   const refreshHistoryButton = document.getElementById(
  'refresh-history-button'
) as HTMLButtonElement
   const clearHistoryButton = document.getElementById(
  'clear-history-button'
) as HTMLButtonElement
   const pinLastButton = document.getElementById(
  'pin-last-button'
) as HTMLButtonElement
 
   return {
     hotkeyInput,
     autoSaveInput,
     saveDirInput,
     openEditorInput,
     saveButton,
     statusText,
     historyList,
     refreshHistoryButton,
     clearHistoryButton,
     pinLastButton
   }
 }
 
 const {
   hotkeyInput,
   autoSaveInput,
   saveDirInput,
   openEditorInput,
   saveButton,
   statusText,
   historyList,
   refreshHistoryButton,
   clearHistoryButton,
   pinLastButton
 } = (() => {
   renderSettingsUI()
   return getElements()
 })()

async function loadSettings() {
  try {
    const settings = await window.api.getSettings()
    hotkeyInput.value = settings.hotkey
    autoSaveInput.checked = settings.autoSaveToFile
    saveDirInput.value = settings.saveDir
    openEditorInput.checked = settings.openEditorAfterCapture
  } catch (error) {
    statusText.textContent = '加载设置失败'
    console.error(error)
  }
}

async function saveSettings() {
  try {
    const patch: Partial<AppConfig> = {
      hotkey: hotkeyInput.value.trim(),
      autoSaveToFile: autoSaveInput.checked,
      saveDir: saveDirInput.value.trim(),
      openEditorAfterCapture: openEditorInput.checked
    }
    // 保存后主进程会重新注册全局快捷键；截图的开启入口在主进程 createCaptureWindow()
    const updated = await window.api.updateSettings(patch)
    statusText.textContent = '设置已保存'
    setTimeout(() => {
      statusText.textContent = ''
    }, 1500)
    hotkeyInput.value = updated.hotkey
    saveDirInput.value = updated.saveDir
  } catch (error) {
    statusText.textContent = '保存失败'
    console.error(error)
  }
}

saveButton.addEventListener('click', () => {
  void saveSettings()
})

async function loadHistory() {
  try {
    const list = await window.api.getHistory()
    historyList.innerHTML = ''
    if (!list.length) {
      const li = document.createElement('li')
      li.textContent = '暂无历史截图'
      historyList.appendChild(li)
      return
    }
    for (const item of list) {
      const li = document.createElement('li')
      const date = new Date(item.createdAt)
      li.textContent = `${date.toLocaleString()} - ${item.filePath}`
      li.style.marginBottom = '4px'
      historyList.appendChild(li)
    }
  } catch (error) {
    console.error(error)
  }
}

refreshHistoryButton.addEventListener('click', () => {
  void loadHistory()
})

clearHistoryButton.addEventListener('click', async () => {
  await window.api.clearHistory()
  void loadHistory()
})

pinLastButton.addEventListener('click', () => {
  void window.api.pinLast()
})

void loadSettings()
void loadHistory()
