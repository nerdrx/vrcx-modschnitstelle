export function isAndroidHost(host = typeof window === 'undefined' ? undefined : window) {
    return Boolean(host && (host.NXAndroid || host.VRCX_ANDROID === true));
}
