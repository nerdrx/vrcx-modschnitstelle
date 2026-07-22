// ctx singleton so the view (created by the router, not by us) can reach the
// mod context without importing VRCX internals.
let _ctx = null;

export function setCtx(ctx) {
    _ctx = ctx;
}

export function getCtx() {
    if (!_ctx) {
        throw new Error('[profilearchiver] ctx not initialized');
    }
    return _ctx;
}
