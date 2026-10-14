// Run only against an isolated, debuggable emulator. Never use a personal account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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
    const result = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(result.data, 'base64'));
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 900));
try {
    await call('Runtime.enable');
    await call('Page.enable');
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
        const me = {...$pinia.user.currentUser,id:'usr_android_smoke',displayName:'Phone Preview',status:'active',friends:['usr_smoke_friend'],onlineFriends:[],offlineFriends:['usr_smoke_friend'],activeFriends:[]};
        const friend = {...me,id:'usr_smoke_friend',displayName:'Sample Friend',location:'offline',last_login:new Date().toISOString()};
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
        $pinia.friend.friends.set(friend.id,{ref:friend,name:friend.displayName});
        state.isLoggedIn=true;
        state.isFriendsLoaded=true;
        return true;
    })()`);
    await pause();
    const views = [
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
    const report = {
        exceptions,
        logs,
        states,
        publicApiProbe,
        fixture: 'Synthetic user and friend; no authenticated API calls'
    };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
    console.log(`Login, phone settings and all five mod routes passed. Screenshots: ${output}`);
} finally {
    socket.close();
}
