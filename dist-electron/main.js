import { BrowserWindow, app, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
//#region electron/main.js
var __dirname = path.dirname(fileURLToPath(import.meta.url));
function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		frame: false,
		titleBarStyle: "hidden",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: true,
			contextIsolation: false
		}
	});
	if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
	else mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}
app.whenReady().then(() => {
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
ipcMain.on("window-control", (event, action) => {
	const win = BrowserWindow.getFocusedWindow();
	if (!win) return;
	if (action === "minimize") win.minimize();
	if (action === "maximize") win.isMaximized() ? win.unmaximize() : win.maximize();
	if (action === "close") win.close();
});
//#endregion
