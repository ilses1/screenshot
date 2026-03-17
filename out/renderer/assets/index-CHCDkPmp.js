const app = document.getElementById("app");
function renderSettingsUI() {
  app.innerHTML = `
  <main style="font-family: system-ui, sans-serif; padding: 24px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <h1 style="font-size: 24px; margin-bottom: 16px;">截图工具设置</h1>
    <section style="margin-bottom: 16px;">
      <label style="display: block; margin-bottom: 8px;">
        截图快捷键（固定）：
        <input id="hotkey-input" style="margin-left: 8px; padding: 4px 8px; width: 160px;" value="F1" disabled />
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
 `;
}
function getElements() {
  const hotkeyInput2 = document.getElementById("hotkey-input");
  const autoSaveInput2 = document.getElementById(
    "auto-save-input"
  );
  const saveDirInput2 = document.getElementById(
    "save-dir-input"
  );
  const openEditorInput2 = document.getElementById(
    "open-editor-input"
  );
  const saveButton2 = document.getElementById("save-button");
  const statusText2 = document.getElementById("status-text");
  const historyList2 = document.getElementById("history-list");
  const refreshHistoryButton2 = document.getElementById(
    "refresh-history-button"
  );
  const clearHistoryButton2 = document.getElementById(
    "clear-history-button"
  );
  const pinLastButton2 = document.getElementById(
    "pin-last-button"
  );
  return {
    hotkeyInput: hotkeyInput2,
    autoSaveInput: autoSaveInput2,
    saveDirInput: saveDirInput2,
    openEditorInput: openEditorInput2,
    saveButton: saveButton2,
    statusText: statusText2,
    historyList: historyList2,
    refreshHistoryButton: refreshHistoryButton2,
    clearHistoryButton: clearHistoryButton2,
    pinLastButton: pinLastButton2
  };
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
  renderSettingsUI();
  return getElements();
})();
async function loadSettings() {
  try {
    const settings = await window.api.getSettings();
    hotkeyInput.value = "F1";
    autoSaveInput.checked = settings.autoSaveToFile;
    saveDirInput.value = settings.saveDir;
    openEditorInput.checked = settings.openEditorAfterCapture;
  } catch (error) {
    statusText.textContent = "加载设置失败";
    console.error(error);
  }
}
async function saveSettings() {
  try {
    const patch = {
      autoSaveToFile: autoSaveInput.checked,
      saveDir: saveDirInput.value.trim(),
      openEditorAfterCapture: openEditorInput.checked
    };
    const updated = await window.api.updateSettings(patch);
    statusText.textContent = "设置已保存";
    setTimeout(() => {
      statusText.textContent = "";
    }, 1500);
    hotkeyInput.value = "F1";
    saveDirInput.value = updated.saveDir;
  } catch (error) {
    statusText.textContent = "保存失败";
    console.error(error);
  }
}
saveButton.addEventListener("click", () => {
  void saveSettings();
});
async function loadHistory() {
  try {
    const list = await window.api.getHistory();
    historyList.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.textContent = "暂无历史截图";
      historyList.appendChild(li);
      return;
    }
    for (const item of list) {
      const li = document.createElement("li");
      const date = new Date(item.createdAt);
      li.textContent = `${date.toLocaleString()} - ${item.filePath}`;
      li.style.marginBottom = "4px";
      historyList.appendChild(li);
    }
  } catch (error) {
    console.error(error);
  }
}
refreshHistoryButton.addEventListener("click", () => {
  void loadHistory();
});
clearHistoryButton.addEventListener("click", async () => {
  await window.api.clearHistory();
  void loadHistory();
});
pinLastButton.addEventListener("click", () => {
  void window.api.pinLast();
});
void loadSettings();
void loadHistory();
