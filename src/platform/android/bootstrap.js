import { installAndroidBridge } from './bridge';
import './mobile.css';

try {
    const { call } = installAndroidBridge(window.NXAndroid);
    const granted = await call('AppApiElectron', 'GetNotificationPermission');
    class AndroidNotification {
        constructor(title, options = {}) {
            call('AppApiElectron', 'DesktopNotification', [title, options.body || '', options.icon || '']).catch(
                console.error
            );
        }
        close() {}
        static permission = granted ? 'granted' : 'default';
        static async requestPermission() {
            const allowed = await call('AppApiElectron', 'RequestNotificationPermission');
            this.permission = allowed ? 'granted' : 'denied';
            return this.permission;
        }
    }
    window.Notification = AndroidNotification;
    await import('../../app.js');
} catch (error) {
    console.error('Android startup failed:', error);
    const root = document.getElementById('root');
    const message = document.createElement('p');
    message.textContent = `VRCX could not start: ${error.message}. Close and reopen the app. Your data has been kept.`;
    root.replaceChildren(message);
}
