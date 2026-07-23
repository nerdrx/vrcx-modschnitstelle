// ctx singleton so views/engine reach the mod context without VRCX imports.
let _ctx = null;

export function setCtx(ctx) {
    _ctx = ctx;
}

export function getCtx() {
    if (!_ctx) {
        throw new Error('[globaldb] ctx not initialized');
    }
    return _ctx;
}
