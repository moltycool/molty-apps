import electron from "electron";

const { contextBridge, ipcRenderer } = electron;

contextBridge.exposeInMainWorld("molty", {
  getApiBase: () => ipcRenderer.invoke("get-api-base"),
  getLoginItemSettings: () => ipcRenderer.invoke("get-login-item-settings"),
  setLoginItemSettings: (openAtLogin: boolean) =>
    ipcRenderer.invoke("set-login-item-settings", openAtLogin)
});
