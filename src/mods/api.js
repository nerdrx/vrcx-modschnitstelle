// ============================================================================
// VRCX Mod API — stable surface for mods.
//
// Design goal: mods NEVER import VRCX internals directly. Everything a mod
// needs is handed to it through the ModContext created here. When upstream
// VRCX refactors its internals, only THIS file needs to adapt — mods keep
// working unchanged.
//
// Upstream files touched by the whole mod system (keep this list current):
//   - src/app.js            (+2 lines: import + initMods call)
//   - src/plugins/router.js (+1 line: name for the main layout route)
// ============================================================================

import { watch } from 'vue';

import { i18n } from '../plugins/i18n';
import { navDefinitions } from '../shared/constants/ui';
import { dispatchNavLayoutUpdated } from '../components/nav-menu/navLayoutEvents';
import { getWorldName } from '../shared/utils/world';
import { showWorldDialog } from '../coordinators/worldCoordinator';
import { showUserDialog } from '../coordinators/userCoordinator';
import { instanceRequest } from '../api';
import { watchState } from '../services/watchState';
import { database, dbVars } from '../services/database';
import sqliteService from '../services/sqlite';
import { useFeedStore } from '../stores/feed';
import { useFriendStore } from '../stores/friend';
import { useInstanceStore } from '../stores/instance';
import { useUserStore } from '../stores/user';

/**
 * Feed event types re-emitted to mods.
 * These map 1:1 to VRCX feed entry types flowing through feedStore.addFeedEntry.
 */
export const FEED_EVENTS = ['GPS', 'Online', 'Offline', 'Status', 'Avatar', 'Bio'];

const listeners = new Map(); // eventName -> Set<handler>
let bridgeInstalled = false;

// ---------------------------------------------------------------------------
// i18n persistence: VRCX (re)loads its locale catalogs via setLocaleMessage()
// — on startup right after login and on every language change. That call
// REPLACES the whole catalog for a locale, wiping anything mods merged in
// earlier (nav labels would then render as raw keys). We therefore keep a
// registry of every message mods contributed and re-merge it after each
// catalog load via a one-time wrapper around setLocaleMessage.
// ---------------------------------------------------------------------------
const modMessages = new Map(); // locale -> deep message object
let i18nGuardInstalled = false;

function deepMerge(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            if (!target[key] || typeof target[key] !== 'object') {
                target[key] = {};
            }
            deepMerge(target[key], value);
        } else {
            target[key] = value;
        }
    }
    return target;
}

function registerModMessages(locale, messages) {
    if (!modMessages.has(locale)) {
        modMessages.set(locale, {});
    }
    deepMerge(modMessages.get(locale), messages);
    i18n.global.mergeLocaleMessage(locale, messages);

    if (!i18nGuardInstalled) {
        i18nGuardInstalled = true;
        const original = i18n.global.setLocaleMessage.bind(i18n.global);
        i18n.global.setLocaleMessage = (loc, msgs) => {
            original(loc, msgs);
            const own = modMessages.get(loc);
            if (own) {
                i18n.global.mergeLocaleMessage(loc, own);
            }
        };
    }
}

function emit(eventName, payload) {
    const set = listeners.get(eventName);
    if (!set) {
        return;
    }
    for (const handler of set) {
        try {
            handler(payload);
        } catch (err) {
            console.error(`[mods] listener for "${eventName}" failed:`, err);
        }
    }
}

/**
 * Install the single bridge between VRCX internals and the mod event bus.
 * Uses Pinia's $onAction (fires on every invocation, BEFORE the action body
 * and therefore before any UI-side filtering inside addFeedEntry).
 */
export function installEventBridge({ router }) {
    if (bridgeInstalled) {
        return;
    }
    bridgeInstalled = true;

    const feedStore = useFeedStore();
    feedStore.$onAction(({ name, args }) => {
        if (name !== 'addFeedEntry') {
            return;
        }
        const feed = args[0];
        if (!feed || !feed.type) {
            return;
        }
        emit('feed', feed);
        emit(`feed:${feed.type}`, feed);
    });

    watch(
        () => watchState.isLoggedIn,
        (loggedIn) => {
            emit(loggedIn ? 'login' : 'logout', {
                userId: dbVars.userId
            });
        }
    );

    void router;
}

/**
 * Create the per-mod context object (the "API" a mod codes against).
 * @param {object} mod       Mod definition ({ id, name, version, setup }).
 * @param {object} host      { app, router, pinia }
 */
export function createModContext(mod, host) {
    const modId = mod.id.toLowerCase().replace(/[^a-z0-9]/g, '');

    const ctx = {
        // ------------------------------------------------------------ meta --
        modId,
        name: mod.name || mod.id,
        version: mod.version || '0.0.0',

        log: (...a) => console.log(`[mod:${modId}]`, ...a),
        warn: (...a) => console.warn(`[mod:${modId}]`, ...a),
        error: (...a) => console.error(`[mod:${modId}]`, ...a),

        // ---------------------------------------------------------- events --
        /**
         * Subscribe to a mod event.
         * Events: 'feed', 'feed:Status', 'feed:Online', 'feed:Offline',
         *         'feed:GPS', 'feed:Avatar', 'feed:Bio', 'login', 'logout'.
         * @returns {function} unsubscribe
         */
        on(eventName, handler) {
            let set = listeners.get(eventName);
            if (!set) {
                set = new Set();
                listeners.set(eventName, set);
            }
            set.add(handler);
            return () => set.delete(handler);
        },

        /**
         * Run the handler once the user DB is ready (login done). If already
         * logged in, runs immediately. Re-runs on every subsequent login
         * (account switch).
         */
        onLogin(handler) {
            if (watchState.isLoggedIn) {
                Promise.resolve()
                    .then(() => handler({ userId: dbVars.userId }))
                    .catch((e) => ctx.error('onLogin handler failed:', e));
            }
            return ctx.on('login', handler);
        },

        // -------------------------------------------------------------- db --
        db: {
            /**
             * Table name prefix reserved for this mod, per VRCX user.
             * Example: usr123_mod_statustracker
             */
            prefix() {
                return `${dbVars.userPrefix}_mod_${modId}`;
            },
            /** Prefix of the core VRCX per-user tables (read access). */
            corePrefix() {
                return dbVars.userPrefix;
            },
            /**
             * Run a SELECT. Rows arrive as positional arrays.
             * @returns {Promise<Array>} collected rows
             */
            async query(sql, args = null) {
                const rows = [];
                await sqliteService.execute((row) => rows.push(row), sql, args);
                return rows;
            },
            /** Run DDL/INSERT/UPDATE/DELETE. */
            async exec(sql, args = null) {
                return sqliteService.executeNonQuery(sql, args);
            },
            /** Escape hatch: the full VRCX database service (unstable API). */
            raw: database
        },

        // ---------------------------------------------------------- stores --
        stores: {
            get friends() {
                return useFriendStore(host.pinia);
            },
            get user() {
                return useUserStore(host.pinia);
            },
            get feed() {
                return useFeedStore(host.pinia);
            },
            get instances() {
                return useInstanceStore(host.pinia);
            }
        },

        // ------------------------------------------------------------- api --
        /**
         * Selected VRChat-API helpers, routed through VRCX's own request
         * layer (queueing/caching). Use sparingly — VRChat rate-limits.
         */
        api: {
            /**
             * Resolve a world/instance tag to the world name via the API.
             * @param {string} location e.g. 'wrld_xxx' or 'wrld_xxx:1234~...'
             * @returns {Promise<string>} '' when not resolvable
             */
            getWorldName(location) {
                return getWorldName(location);
            },

            /**
             * Fetch live instance data (occupancy etc.) for a full instance
             * tag like 'wrld_xxx:12345~region(eu)'.
             * @returns {Promise<object|null>} raw instance JSON or null
             */
            async getInstance(location) {
                const sep = (location || '').indexOf(':');
                if (sep < 0) {
                    return null;
                }
                const args = await instanceRequest.getInstance({
                    worldId: location.slice(0, sep),
                    instanceId: location.slice(sep + 1)
                });
                return args?.json || null;
            }
        },

        // -------------------------------------------------------------- ui --
        ui: {
            /**
             * Open VRCX's native world dialog for a location tag
             * ('wrld_xxx' or full instance tag).
             */
            showWorldDialog(location) {
                showWorldDialog(location);
            },

            /** Open VRCX's native user dialog (profile) for a user id. */
            showUserDialog(userId) {
                showUserDialog(userId);
            },

            /**
             * Fire a notification through VRCX's native channels (same
             * pipeline as VRCX notys): Windows toast, XSOverlay UDP and the
             * VRCX VR overlay. Callers decide *when* to notify (DND etc.).
             * No-op outside the CEF build.
             * @param {object} n
             * @param {string} n.title
             * @param {string} [n.body]
             * @param {string} [n.image]   local file path for the toast
             * @param {boolean} [n.desktop=true]
             * @param {boolean} [n.xs=true]
             * @param {boolean} [n.vr=true]
             */
            async notify({
                title,
                body = '',
                image = '',
                desktop = true,
                xs = true,
                vr = true
            }) {
                if (typeof AppApi === 'undefined') {
                    return;
                }
                const text = body ? `${title}: ${body}` : title;
                if (desktop) {
                    try {
                        await AppApi.DesktopNotification(title, body, image);
                    } catch {}
                }
                if (xs) {
                    try {
                        AppApi.XSNotification('VRCX', text, 5, 1, image);
                    } catch {}
                }
                if (vr) {
                    try {
                        AppApi.ExecuteVrOverlayFunction(
                            'playNoty',
                            JSON.stringify({
                                noty: {
                                    type: 'Event',
                                    created_at: new Date().toJSON(),
                                    data: text
                                },
                                message: '',
                                image: ''
                            })
                        );
                    } catch {}
                }
            },

            /**
             * Register a view reachable from the nav menu.
             * @param {object} def
             * @param {string} def.key        unique route/nav key, e.g. 'mod-status-tracker'
             * @param {object} def.component  Vue component
             * @param {string} def.icon       remixicon class, e.g. 'ri-donut-chart-line'
             * @param {object} def.label      { en: '...', de: '...' } plain labels
             */
            addNavView({ key, component, icon, label }) {
                // Idempotent: safe to call again after re-login.
                if (navDefinitions.some((d) => d.key === key)) {
                    return;
                }
                const labelKey = `mods.${modId}.nav.${key}`;
                for (const [locale, text] of Object.entries(label || {})) {
                    registerModMessages(locale, deepSet(labelKey, text));
                }
                if (!label?.en) {
                    registerModMessages('en', deepSet(labelKey, key));
                }

                host.router.addRoute('main-layout', {
                    path: key,
                    name: key,
                    component,
                    meta: { navKey: key }
                });

                navDefinitions.push({
                    key,
                    icon: icon || 'ri-puzzle-line',
                    tooltip: labelKey,
                    labelKey,
                    routeName: key
                });

                // Late registration (after app mount, e.g. in onLogin):
                // tell the nav menu to rebuild its layout so the new entry
                // is appended and rendered.
                if (typeof window !== 'undefined') {
                    try {
                        dispatchNavLayoutUpdated();
                    } catch {}
                }
            }
        }
    };

    return ctx;
}

function deepSet(dottedKey, value) {
    const result = {};
    let node = result;
    const parts = dottedKey.split('.');
    parts.forEach((part, i) => {
        if (i === parts.length - 1) {
            node[part] = value;
        } else {
            node[part] = {};
            node = node[part];
        }
    });
    return result;
}
