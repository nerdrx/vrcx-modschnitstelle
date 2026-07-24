import { VueQueryPlugin } from '@tanstack/vue-query';
import { createApp } from 'vue';

import {
    i18n,
    initComponents,
    initPlugins,
    initRouter,
    initSentry
} from './plugins';
import { initPiniaPlugins, pinia } from './stores';
import { queryClient } from './queries';
import { initMods } from './mods'; // MOD-API

import App from './App.vue';

await initPlugins();
await initPiniaPlugins();

// #region | Hey look it's most of VRCX!

const app = createApp(App);

app.use(pinia).use(i18n).use(VueQueryPlugin, { queryClient });
initComponents(app);
initRouter(app);
await initSentry(app);

// MOD-FIX: Polyfill standard Notification API for mods
if (window.electron && window.electron.desktopNotification) {
    window.Notification = function(title, options) {
        window.electron.desktopNotification(title, options?.body || '', options?.icon || '');
        return {
            close: () => {},
            onclick: null,
            onclose: null,
            onerror: null,
            onshow: null
        };
    };
    window.Notification.permission = 'granted';
    window.Notification.requestPermission = async () => 'granted';
}

await initMods({ app }); // MOD-API

app.mount('#root');
