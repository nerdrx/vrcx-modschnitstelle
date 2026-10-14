// Android calls use the same async interface as VRCX's desktop host.
export function installAndroidBridge(host, target = window) {
    if (!host || typeof host.postMessage !== 'function') {
        throw new Error('The Android host is missing. Open this page in VRCX with Mods for Android.');
    }
    let nextId = 0;
    const pending = new Map();
    const listeners = new Map();

    function call(className, methodName, args = []) {
        return new Promise((resolve, reject) => {
            const id = ++nextId;
            const timeout = setTimeout(
                () => {
                    pending.delete(id);
                    reject(new Error(`${className}.${methodName} timed out`));
                },
                methodName === 'ImportHistory' ? 600_000 : 120_000
            );
            pending.set(id, { resolve, reject, timeout });
            try {
                host.postMessage(
                    JSON.stringify({ id, className, methodName, args }, (_, value) =>
                        value instanceof Map ? Object.fromEntries(value) : value
                    )
                );
            } catch (error) {
                clearTimeout(timeout);
                pending.delete(id);
                reject(error);
            }
        });
    }

    target.__nxAndroidResult = ({ id, result, error }) => {
        const entry = pending.get(id);
        if (!entry) return;
        clearTimeout(entry.timeout);
        pending.delete(id);
        if (error) entry.reject(new Error(error));
        else entry.resolve(result);
    };

    target.__nxAndroidLifecycle = (event) => {
        for (const callback of listeners.get(event) || []) callback();
    };

    target.__nxAndroidBack = () => dismissAndroidOverlay(target);

    function on(event, callback) {
        const callbacks = listeners.get(event) || new Set();
        callbacks.add(callback);
        listeners.set(event, callbacks);
        return () => callbacks.delete(callback);
    }

    target.WINDOWS = false;
    target.LINUX = true; // Reuse VRCX's JSON IPC path, not Electron itself.
    target.VRCX_ANDROID = true;
    target.interopApi = { callDotNetMethod: call };
    target.electron = {
        getArch: () => Promise.resolve('arm64'),
        getNoUpdater: () => Promise.resolve(true),
        getClipboardText: () => call('AppApiElectron', 'GetClipboard'),
        desktopNotification: (title, body, image) =>
            call('AppApiElectron', 'DesktopNotification', [title, body, image]),
        setThemeSource: () => Promise.resolve(),
        setTrayIconNotification: () => Promise.resolve(),
        onSystemThemeChanged: () => () => {},
        onWindowPositionChanged: () => () => {},
        onWindowSizeChanged: () => () => {},
        onWindowStateChange: () => () => {},
        onBrowserFocus: (callback) => on('focus', callback),
        onBrowserBlur: (callback) => on('blur', callback),
        openFileDialog: () => Promise.reject(new Error('Use Phone settings to import desktop history.')),
        openDirectoryDialog: () => Promise.reject(new Error('Desktop folders are unavailable on Android.')),
        getOverlayWindow: () => Promise.resolve(null),
        updateVr: () => Promise.resolve(),
        restartApp: () => target.location.reload(),
        ipcRenderer: { on: () => () => {} }
    };

    return { call };
}

export function dismissAndroidOverlay(target = window) {
    const layers = target.document.querySelectorAll(
        '[data-state="open"][role="dialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]'
    );
    const top = Array.from(layers)
        .reverse()
        .find((layer) => layer.getClientRects().length);
    if (!top) return false;
    top.dispatchEvent(
        new target.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })
    );
    return true;
}
