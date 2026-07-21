// Holds the mod context so the routed Vue view can reach the mod API.
let _ctx = null;

export function setCtx(ctx) {
    _ctx = ctx;
}

export function getCtx() {
    if (!_ctx) {
        throw new Error('[mod:statustracker] context not initialized yet');
    }
    return _ctx;
}
