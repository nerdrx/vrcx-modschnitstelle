// Run only against an isolated, debuggable emulator. Never use a personal account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const endpoint = process.argv[2] || 'http://127.0.0.1:19580';
const assets = path.resolve(import.meta.dirname, '../build/android/frontend/assets');
const output = process.argv[3] || '/tmp/vrcx-android-smoke';
fs.mkdirSync(output, { recursive: true });
const pages = await (await fetch(`${endpoint}/json`)).json();
const page = pages.find((item) => item.url.startsWith('https://vrcx.local/'));
assert(page, 'No VRCX Android WebView');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const exceptions = [];
const logs = [];
let publicApiProbe = null;
socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
        const entry = pending.get(message.id);
        if (entry) {
            clearTimeout(entry.timeout);
            message.error ? entry.reject(message.error) : entry.resolve(message.result);
            pending.delete(message.id);
        }
    } else if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push(message.params.exceptionDetails);
    } else if (message.method === 'Runtime.consoleAPICalled') {
        logs.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
});
function call(method, params = {}) {
    return new Promise((resolve, reject) => {
        const number = ++id;
        const timeout = setTimeout(() => {
            pending.delete(number);
            reject(new Error(`${method} timed out`));
        }, 60_000);
        pending.set(number, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id: number, method, params }));
    });
}
async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
}
async function screenshot(name) {
    const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(result.data, 'base64'));
}
async function tapButton(text) {
    const point = await evaluate(`(() => {
        const button = Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === ${JSON.stringify(text)} && el.getClientRects().length);
        if (!button) throw new Error('Missing button: ' + ${JSON.stringify(text)});
        const r = button.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
        if (r.width < 44 || r.height < 44) throw new Error('Small tap target: ' + ${JSON.stringify(text)});
        if (!button.contains(document.elementFromPoint(x, y))) throw new Error('Covered button: ' + ${JSON.stringify(text)});
        return {x, y};
    })()`);
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pause();
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 900));
try {
    await call('Runtime.enable');
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 393, height: 760, deviceScaleFactor: 1, mobile: true });
    await call('Emulation.setTouchEmulationEnabled', { enabled: true });
    const savedBeforeReload = await evaluate(`VRCXStorage.Get('config:savedcredentials')`);
    assert(['', '{}'].includes(savedBeforeReload), 'Refusing to use a WebView with saved accounts');
    await evaluate(`VRCXStorage.Remove('config:lastuserloggedin')`);
    exceptions.length = 0;
    logs.length = 0;
    await call('Page.reload');
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const routerExpression = `document.querySelector('#root').__vue_app__.config.globalProperties.$router`;
    await evaluate(`${routerExpression}.push({ name: 'login' })`);
    await pause();
    const credentials = await evaluate(`configRepository.getString('savedCredentials', '{}')`);
    assert.equal(credentials, '{}', 'Refusing to seed a WebView with saved accounts');
    const text = await evaluate('document.body.innerText');
    assert(text.includes('Login'));
    if (process.argv.includes('--live')) {
        publicApiProbe = await evaluate(`(async () => {
            const response = JSON.parse(await WebApi.ExecuteJson(JSON.stringify({url:'https://api.vrchat.cloud/api/1/config',method:'GET'})));
            return {status:response.status,json:typeof JSON.parse(response.message) === 'object'};
        })()`);
        assert.equal(publicApiProbe.status, 200, 'Native public VRChat request failed');
        assert(publicApiProbe.json);
    }
    for (const mod of ['statustracker', 'friendcare', 'orbitgraph', 'globaldb']) {
        assert(
            logs.some((line) => line.includes(`[mods] loaded ${mod} `)),
            `${mod} failed to load`
        );
    }
    assert.equal(
        await evaluate(
            `(async () => JSON.parse(await SQLite.ExecuteJson('SELECT @empty IS NULL, typeof(@n)', new Map([['@empty', null], ['@n', 7]])))[0][0])()`
        ),
        1
    );
    await screenshot('login');
    await evaluate(`${routerExpression}.push({ name: 'android-phone' })`);
    await pause();
    assert((await evaluate('document.body.innerText')).includes('Import desktop history'));
    await screenshot('phone-settings');
    await evaluate(`${routerExpression}.push({ name: 'login' })`);

    // Import the bundled reactive state to seed local views without calling login or an API.
    let stateModule;
    for (const filename of fs.readdirSync(assets).filter((name) => name.endsWith('.js'))) {
        const code = fs.readFileSync(path.join(assets, filename), 'utf8');
        const state = code.match(
            /(?:var|const|let) (\w+)=\w+\(\{isLoggedIn:!1,isFriendsLoaded:!1,isFavoritesLoaded:!1\}\)/
        );
        if (!state) continue;
        const exported = code.match(new RegExp(`\\b${state[1]} as (\\w+)`));
        if (exported) {
            stateModule = { filename, exported: exported[1] };
            break;
        }
    }
    assert(stateModule, 'Could not locate the bundled state for isolated fixture views');
    await evaluate(`(async () => {
        const state = (await import('/frontend/assets/${stateModule.filename}')).${stateModule.exported};
        if (state.isLoggedIn) throw new Error('Refusing to overwrite a logged-in session');
        const native = window.WebApi;
        const me = {...$pinia.user.currentUser,id:'usr_android_smoke',displayName:'Phone Preview',status:'active',friends:['usr_smoke_friend'],onlineFriends:['usr_smoke_friend'],offlineFriends:[],activeFriends:[]};
        const friend = {...me,id:'usr_smoke_friend',displayName:'Sample Friend',location:'private',last_login:new Date().toISOString()};
        window.WebSocket = class extends EventTarget {
            static OPEN = 1;
            readyState = 1;
            constructor() { super(); setTimeout(() => this.onopen?.({}), 0); }
            send() {}
            close() { this.readyState = 3; }
        };
        window.WebApi = {
            GetCookies: (...args) => native.GetCookies(...args),
            ClearCookies: (...args) => native.ClearCookies(...args),
            ExecuteJson: async options => {
                const url = JSON.parse(options).url;
                let data = [];
                if (url.endsWith('/auth/user')) data = me;
                else if (url.includes('/users/usr_smoke_friend')) data = friend;
                else if (url.includes('/auth/user/friends')) data = [friend];
                else if (url.includes('/auth/user/notes')) data = [];
                else if (url.includes('/auth/user')) data = [];
                if (url.includes('/instances')) data = {instances:[]};
                if (url.startsWith('https://pool.invalid/')) data = {members:[{user_id:me.id,display_name:me.displayName}],rows:[],messages:[],state:[],reactions:[],eligible:true,member:true};
                return JSON.stringify({status:200,message:JSON.stringify(data)});
            }
        };
        await database.initUserTables('usr_android_smoke');
        await VRCXStorage.Set('usrandroidsmoke_mod_globaldb_settings',JSON.stringify({token:'synthetic-test-token',enabled:true,serverUrl:'https://pool.invalid',intervalMin:60}));
        await VRCXStorage.Set('usrandroidsmoke_mod_globaldb_first_sync_done','true');
        Object.assign($pinia.user.currentUser, me);
        $pinia.user.cachedUsers.set(friend.id, friend);
        $pinia.friend.friends.set(friend.id,{id:friend.id,ref:friend,name:friend.displayName,state:'online'});
        state.isLoggedIn=true;
        state.isFriendsLoaded=true;
        return true;
    })()`);
    await pause();
    await evaluate(`(() => {
        const ref = $pinia.user.cachedUsers.get('usr_smoke_friend');
        ref.name = ref.displayName;
        $pinia.friend.friends.set(ref.id, {id:ref.id,ref,name:ref.displayName,state:'online',isVIP:false});
        $pinia.friend.reindexSortedFriend(ref.id);
    })()`);
    const views = [
        ['feed', 'feed'],
        ['friends-locations', 'friends'],
        ['search', 'search'],
        ['notification', 'invites'],
        ['settings', 'settings'],
        ['mod-status-tracker', 'status-tracker'],
        ['mod-friend-care', 'friend-care'],
        ['mod-orbit-graph', 'orbit-graph'],
        ['mod-global-db', 'global-db'],
        ['mod-pool-chat', 'pool-chat']
    ];
    const states = [];
    for (const [name, file] of views) {
        await evaluate(`${routerExpression}.push({name:${JSON.stringify(name)}})`);
        await pause();
        const state = await evaluate(
            `({text:document.body.innerText,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,route:${routerExpression}.currentRoute.value.name})`
        );
        assert.equal(state.route, name);
        assert(state.text.length > 30, `${name} rendered no content`);
        assert(state.scrollWidth <= state.width + 2, `${name} overflows the phone viewport`);
        states.push(state);
        await screenshot(file);
    }
    const interactionChecks = [];
    await evaluate(`${routerExpression}.push({name:'friends-locations'})`);
    await pause();
    const friendPoint = await evaluate(
        `(() => { const name = document.querySelector('.friend-card__name'); if (!name) throw new Error('No synthetic friend card'); const r = name.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`
    );
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [friendPoint] });
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pause();
    assert(await evaluate(`$pinia.user.userDialog.visible`), 'Friend card tap did not open the profile');
    const dialog = await evaluate(
        `(() => { const r = document.querySelector('[data-slot="dialog-content"][data-state="open"]').getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; })()`
    );
    assert(
        dialog.left >= -1 && dialog.right <= 394 && dialog.top >= -1 && dialog.bottom <= 761,
        'Friend profile clipped'
    );
    await screenshot('friend-profile');
    await evaluate('window.__nxAndroidBack()');
    await pause();
    assert(!(await evaluate(`$pinia.user.userDialog.visible`)), 'Back did not dismiss the friend profile');
    for (const [width, height] of [
        [320, 640],
        [393, 760],
        [844, 390]
    ]) {
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
        await call('Emulation.setTouchEmulationEnabled', { enabled: true });
        for (const [name] of views) {
            await evaluate(`${routerExpression}.push({name:${JSON.stringify(name)}})`);
            await pause();
            assert(
                await evaluate('document.documentElement.scrollWidth <= innerWidth + 2'),
                `${name} overflows at ${width}px`
            );
            assert(
                await evaluate(
                    `(() => { const r = document.querySelector('.android-navigation').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; })()`
                ),
                `Navigation clipped on ${name} at ${width}px`
            );
        }
        await tapButton('Menu');
        const sheet = await evaluate(
            `(() => { const el = document.querySelector('[data-slot="sheet-content"]'); const r = el.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,scrolls:el.scrollHeight>el.clientHeight}; })()`
        );
        assert(
            sheet.left >= -1 && sheet.right <= width + 1 && sheet.top >= -1 && sheet.bottom <= height + 1,
            `Menu clipped at ${width}px`
        );
        await screenshot(`menu-${width}`);
        const routeBeforeBack = await evaluate(`${routerExpression}.currentRoute.value.name`);
        if (process.env.ANDROID_SERIAL) {
            assert(/^emulator-\d+$/.test(process.env.ANDROID_SERIAL), 'Refusing to send Back to a personal device');
            execFileSync(process.env.ADB || 'adb', [
                '-s',
                process.env.ANDROID_SERIAL,
                'shell',
                'input',
                'keyevent',
                '4'
            ]);
        } else await evaluate('window.__nxAndroidBack()');
        await pause();
        assert(
            !(await evaluate(`!!document.querySelector('[data-slot="sheet-content"][data-state="open"]')`)),
            'Back did not dismiss the menu'
        );
        assert.equal(
            await evaluate(`${routerExpression}.currentRoute.value.name`),
            routeBeforeBack,
            'Back navigated behind an open menu'
        );
        await tapButton('Feed');
        assert.equal(await evaluate(`${routerExpression}.currentRoute.value.name`), 'feed');
        interactionChecks.push({ width, height, nativeBack: !!process.env.ANDROID_SERIAL, sheet });
    }
    const report = {
        exceptions,
        logs,
        states,
        publicApiProbe,
        interactionChecks,
        fixture: 'Synthetic user and friend; no authenticated API calls'
    };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
    console.log(
        `Login, phone settings, core views and five mod routes passed; tap/menu/back checks at three viewport sizes. Screenshots: ${output}`
    );
} finally {
    socket.close();
}
