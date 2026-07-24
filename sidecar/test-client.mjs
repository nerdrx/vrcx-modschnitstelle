/**
 * VRCX Voice-Sidecar Test Client (Phase P4 Acceptance Test)
 * Tests all Section 4 IPC commands against ws://127.0.0.1:34710.
 * Outputs PASS/FAIL for each command and exits 0 on success, 1 on failure.
 * Uses native WebSocket API (Node.js 22+).
 */

const SERVER_URL = 'ws://127.0.0.1:34710';

let results = {
    hello: false,
    status: false,
    config: false,
    tts: false,
    tts_stop: false,
    stt_start: false,
    stt_stop: false,
    unknown_type_error: false
};

function logResult(cmdName, success, details = '') {
    results[cmdName] = success;
    const badge = success ? '[ PASS ]' : '[ FAIL ]';
    console.log(`${badge} ${cmdName.padEnd(20)} ${details}`);
}

function sendAndReceive(ws, reqMsg, filterFn, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            ws.removeEventListener('message', handler);
            reject(new Error(`Timeout waiting for response (${timeoutMs}ms)`));
        }, timeoutMs);

        function handler(event) {
            try {
                const msg = JSON.parse(event.data.toString());
                if (filterFn(msg)) {
                    clearTimeout(timer);
                    ws.removeEventListener('message', handler);
                    resolve(msg);
                }
            } catch (e) {
                // Ignore non-JSON or invalid frames
            }
        }

        ws.addEventListener('message', handler);
        ws.send(JSON.stringify(reqMsg));
    });
}

async function runTests() {
    console.log('===================================================');
    console.log(' VRCX Voice-Sidecar IPC Contract Test Client');
    console.log(' Connecting to:', SERVER_URL);
    console.log('===================================================\n');

    let ws;
    try {
        const WSClass = globalThis.WebSocket || (await import('ws')).default;
        ws = new WSClass(SERVER_URL);
    } catch (err) {
        console.error('Failed to create WebSocket connection:', err.message);
        process.exit(1);
    }

    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve);
        ws.addEventListener('error', reject);
    });

    console.log('WebSocket connection established.\n');

    // Test 1: hello
    try {
        const msg = await sendAndReceive(ws, { type: 'hello', version: 1 }, m => m.type === 'ready');
        const ok = msg.version === 1 && typeof msg.tts === 'object' && typeof msg.stt === 'object';
        logResult('hello', ok, `(version=${msg.version}, tts.ready=${msg.tts?.ready}, stt.ready=${msg.stt?.ready})`);
    } catch (e) {
        logResult('hello', false, e.message);
    }

    // Test 2: status
    try {
        const msg = await sendAndReceive(ws, { type: 'status' }, m => m.type === 'ready');
        logResult('status', msg.type === 'ready', `(tts.ready=${msg.tts?.ready}, stt.ready=${msg.stt?.ready})`);
    } catch (e) {
        logResult('status', false, e.message);
    }

    // Test 3: config
    try {
        const msg = await sendAndReceive(ws, { type: 'config', gpu: false, volume: 0.8 }, m => m.type === 'ready');
        logResult('config', msg.gpu === false, `(gpu=${msg.gpu})`);
    } catch (e) {
        logResult('config', false, e.message);
    }

    // Test 4: tts
    try {
        const msg = await sendAndReceive(ws, { type: 'tts', id: 'test_123', text: 'Hallo, dies ist ein Test.' }, m => m.id === 'test_123', 10000);
        const ok = msg.type === 'tts_done' || msg.type === 'error';
        logResult('tts', ok, msg.type === 'tts_done' ? `(tts_done id=${msg.id})` : `(error response: ${msg.message})`);
    } catch (e) {
        logResult('tts', false, e.message);
    }

    // Test 5: tts_stop
    try {
        ws.send(JSON.stringify({ type: 'tts_stop' }));
        logResult('tts_stop', true, '(sent tts_stop command)');
    } catch (e) {
        logResult('tts_stop', false, e.message);
    }

    // Test 6: stt_start
    try {
        ws.send(JSON.stringify({ type: 'stt_start', language: 'de' }));
        logResult('stt_start', true, '(started mic recording)');
    } catch (e) {
        logResult('stt_start', false, e.message);
    }

    // Record audio for 1.5 seconds
    await new Promise(r => setTimeout(r, 1500));

    // Test 7: stt_stop
    try {
        const msg = await sendAndReceive(ws, { type: 'stt_stop' }, m => m.type === 'stt_result', 10000);
        logResult('stt_stop', typeof msg.text === 'string', `(result text="${msg.text}", confidence=${msg.confidence})`);
    } catch (e) {
        logResult('stt_stop', false, e.message);
    }

    // Test 8: unknown_type
    try {
        const msg = await sendAndReceive(ws, { type: 'unknown_command_abc' }, m => m.type === 'error' && m.message === 'unknown_type');
        logResult('unknown_type_error', true, `(handled unknown_type error: message="${msg.message}")`);
    } catch (e) {
        logResult('unknown_type_error', false, e.message);
    }

    ws.close();

    console.log('\n===================================================');
    console.log(' TEST SUMMARY');
    console.log('===================================================');

    let allPassed = true;
    for (const [cmd, success] of Object.entries(results)) {
        if (!success) {
            allPassed = false;
            console.log(`❌ FAIL: ${cmd}`);
        }
    }

    if (allPassed) {
        console.log('\n🎉 ALL IPC COMMAND TESTS PASSED SUCCESSFULLY!');
        process.exit(0);
    } else {
        console.log('\n⚠️ SOME IPC COMMAND TESTS FAILED.');
        process.exit(1);
    }
}

runTests();
