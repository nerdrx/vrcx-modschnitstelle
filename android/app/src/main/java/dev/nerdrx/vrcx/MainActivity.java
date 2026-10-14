package dev.nerdrx.vrcx;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.database.sqlite.SQLiteDatabase;
import android.database.Cursor;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.io.File;
import java.io.FileOutputStream;

/** Android WebView host for the VRCX frontend assets. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://vrcx.local";
    private static final String NOTIFICATION_CHANNEL = "vrcx";
    private WebView webView;
    private AndroidHostBridge hostBridge;
    private Object pendingHistoryRequestId;
    private Object pendingPermissionRequestId;
    private ValueCallback<Uri[]> pendingFileChooser;
    private static final int HISTORY_REQUEST = 402;
    private static final int MEDIA_REQUEST = 404;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        createNotificationChannel();
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBackNavigation);
        }

        webView = new WebView(this);
        FrameLayout container = new FrameLayout(this);
        container.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            container.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets system = insets.getInsets(WindowInsets.Type.systemBars());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(system.left, system.top, system.right, Math.max(system.bottom, ime.bottom));
                return insets;
            });
            container.requestApplyInsets();
        }
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags &
                android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        CookieManager.getInstance().setAcceptCookie(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!isLocalOrigin(Uri.parse(view.getUrl()))) { callback.onReceiveValue(null); return true; }
                if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
                pendingFileChooser = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                String[] types = params.getAcceptTypes();
                if (types != null && types.length > 0 && !types[0].isEmpty()) intent.putExtra(Intent.EXTRA_MIME_TYPES, types);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(intent, MEDIA_REQUEST); }
                catch (Exception error) { pendingFileChooser.onReceiveValue(null); pendingFileChooser = null; }
                return true;
            }
        });
        hostBridge = new AndroidHostBridge(this, webView);
        webView.addJavascriptInterface(hostBridge, "NXAndroid");
        webView.setWebViewClient(new LocalOriginClient());
        setContentView(container);
        webView.loadUrl(ORIGIN + "/frontend/android.html");
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    NOTIFICATION_CHANNEL, "VRCX", NotificationManager.IMPORTANCE_DEFAULT);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private final class LocalOriginClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isLocalOrigin(uri)) return false;
            if (request.isForMainFrame() && isAllowedExternalLink(uri)) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // No installed app or browser can handle the link.
                }
            }
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!isLocalOrigin(uri)) return null;
            return serveAsset(uri.getPath());
        }

        private WebResourceResponse serveAsset(String requestPath) {
            String path = requestPath == null ? "" : Uri.decode(requestPath);
            if (path.isEmpty() || "/".equals(path)) path = "/frontend/index.html";
            if (path.startsWith("/")) path = path.substring(1);
            if (path.startsWith("frontend/")) path = path.substring("frontend/".length());
            if (path.isEmpty() || path.startsWith("/") || path.contains("\\") ||
                    path.contains(":") || path.contains("..")) {
                return response(400, "Bad Request", "text/plain", "Invalid asset path");
            }

            try {
                InputStream input = getAssets().open("frontend/" + path);
                Map<String, String> headers = new HashMap<>();
                headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; " +
                        "style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; " +
                        "font-src 'self' data:; connect-src 'self' https: wss: blob:; " +
                        "worker-src 'self' blob:; media-src 'self' https: blob: data:; " +
                        "frame-src 'none'; object-src 'none'; base-uri 'self'");
                headers.put("X-Content-Type-Options", "nosniff");
                headers.put("Cache-Control", "no-cache");
                return new WebResourceResponse(mimeType(path), "UTF-8", 200, "OK", headers, input);
            } catch (IOException e) {
                return response(404, "Not Found", "text/plain", "Asset not found");
            }
        }

        private WebResourceResponse response(int status, String reason, String mime, String body) {
            return new WebResourceResponse(mime, "UTF-8", status, reason,
                    Collections.<String, String>emptyMap(),
                    new ByteArrayInputStream(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        }
    }

    static boolean isLocalOrigin(Uri uri) {
        int port = uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) &&
                "vrcx.local".equalsIgnoreCase(uri.getHost()) && (port == -1 || port == 443) &&
                uri.getUserInfo() == null;
    }

    interface OriginCheck { void complete(boolean trusted); }

    void verifyTrustedOrigin(OriginCheck callback) {
        runOnUiThread(() -> {
            Uri current = webView == null ? null : Uri.parse(webView.getUrl() == null ? "" : webView.getUrl());
            callback.complete(current != null && isLocalOrigin(current) &&
                    current.getPath() != null && current.getPath().startsWith("/frontend/"));
        });
    }

    static boolean isAllowedExternalLink(Uri uri) {
        String scheme = uri.getScheme();
        if (uri.getUserInfo() != null) return false;
        if ("https".equalsIgnoreCase(scheme)) return true;
        return "vrchat".equalsIgnoreCase(scheme) && uri.getHost() != null;
    }

    private static String mimeType(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }

    void openLink(String rawUrl) {
        Uri uri = Uri.parse(rawUrl == null ? "" : rawUrl);
        if (!isAllowedExternalLink(uri)) throw new IllegalArgumentException("Unsupported link scheme");
        runOnUiThread(() -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
                // No installed app or browser can handle the link.
            }
        });
    }

    void startHistoryImport(Object requestId) {
        runOnUiThread(() -> {
            if (pendingHistoryRequestId != null) {
                hostBridge.completeImport(requestId, null, "A history import is already in progress");
                return;
            }
            pendingHistoryRequestId = requestId;
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/vnd.sqlite3", "application/x-sqlite3", "application/octet-stream"});
            try {
                startActivityForResult(intent, HISTORY_REQUEST);
            } catch (Exception e) {
                Object id = pendingHistoryRequestId;
                pendingHistoryRequestId = null;
                hostBridge.completeImport(id, null, "Unable to open the file picker");
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == MEDIA_REQUEST) {
            ValueCallback<Uri[]> callback = pendingFileChooser;
            pendingFileChooser = null;
            if (callback != null) callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            return;
        }
        if (requestCode != HISTORY_REQUEST) return;
        final Object id = pendingHistoryRequestId;
        pendingHistoryRequestId = null;
        if (id == null || hostBridge == null) return;
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            org.json.JSONObject cancelled = new org.json.JSONObject();
            try { cancelled.put("cancelled", true); } catch (org.json.JSONException ignored) { }
            hostBridge.completeImport(id, cancelled, null);
            return;
        }
        final Uri uri = data.getData();
        hostBridge.queueHistoryImport(id, () -> importHistory(uri));
    }

    void requestNotificationPermission(Object id) {
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT < 33 ||
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                hostBridge.completePermission(id, true, null);
                return;
            }
            if (pendingPermissionRequestId != null) {
                hostBridge.completePermission(id, false, null);
                return;
            }
            pendingPermissionRequestId = id;
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 403);
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != 403) return;
        Object id = pendingPermissionRequestId;
        pendingPermissionRequestId = null;
        if (id != null && hostBridge != null) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            hostBridge.completePermission(id, granted, null);
        }
    }

    private org.json.JSONObject importHistory(Uri uri) throws Exception {
        File temporary = File.createTempFile("vrcx-history-", ".sqlite3", getCacheDir());
        try {
            try (InputStream input = getContentResolver().openInputStream(uri);
                 FileOutputStream output = new FileOutputStream(temporary)) {
                if (input == null) throw new IllegalArgumentException("Unable to read selected file");
                byte[] buffer = new byte[64 * 1024];
                long total = 0;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > 1024L * 1024L * 1024L) throw new IllegalArgumentException("Database is larger than 1 GiB");
                    output.write(buffer, 0, count);
                }
            }
            byte[] header = new byte[16];
            try (InputStream input = new java.io.FileInputStream(temporary)) {
                if (input.read(header) != header.length || !"SQLite format 3\u0000".equals(new String(header, java.nio.charset.StandardCharsets.US_ASCII))) {
                    throw new IllegalArgumentException("Selected file is not a SQLite database");
                }
            }
            SQLiteDatabase source = SQLiteDatabase.openDatabase(temporary.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            try {
                requireColumns(source, "gamelog_location", new String[]{"created_at", "location", "world_id", "world_name", "time", "group_name"});
                requireColumns(source, "gamelog_join_leave", new String[]{"created_at", "type", "display_name", "location", "user_id", "time"});
                int[] counts = hostBridge.importHistoryRows(source);
                return new org.json.JSONObject().put("locations", counts[0]).put("joins", counts[1]);
            } finally {
                source.close();
            }
        } finally {
            //noinspection ResultOfMethodCallIgnored
            temporary.delete();
        }
    }

    private void requireColumns(SQLiteDatabase db, String table, String[] required) {
        java.util.HashSet<String> columns = new java.util.HashSet<>();
        try (Cursor cursor = db.rawQuery("PRAGMA table_info(`" + table + "`)", null)) {
            while (cursor.moveToNext()) columns.add(cursor.getString(1));
        }
        if (!columns.containsAll(java.util.Arrays.asList(required))) {
            throw new IllegalArgumentException("Selected database is missing required " + table + " columns");
        }
    }

    void notifyUser(String title, String body) {
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                return;
            }
            android.app.Notification notification = new android.app.Notification.Builder(this, NOTIFICATION_CHANNEL)
                    .setSmallIcon(getApplicationInfo().icon == 0 ? android.R.drawable.ic_dialog_info : getApplicationInfo().icon)
                    .setContentTitle(title == null ? "VRCX" : title)
                    .setContentText(body == null ? "" : body)
                    .setContentIntent(android.app.PendingIntent.getActivity(this, 0,
                        new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                        android.app.PendingIntent.FLAG_IMMUTABLE | android.app.PendingIntent.FLAG_UPDATE_CURRENT))
                    .setAutoCancel(true)
                    .build();
            getSystemService(NotificationManager.class).notify((int) (System.currentTimeMillis() & 0x7fffffff), notification);
        });
    }

    String readClipboard() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (clipboard == null || !clipboard.hasPrimaryClip()) return "";
        ClipData clip = clipboard.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return "";
        CharSequence text = clip.getItemAt(0).coerceToText(this);
        return text == null ? "" : text.toString();
    }

    @Override
    public void onBackPressed() {
        handleBackNavigation();
    }

    private void handleBackNavigation() {
        if (webView == null) { finish(); return; }
        webView.evaluateJavascript("Boolean(window.__nxAndroidBack && window.__nxAndroidBack())", handled -> {
            if ("true".equals(handled)) return;
            if (webView.canGoBack()) webView.goBack();
            else finish();
        });
    }

    @Override
    protected void onDestroy() {
        if (pendingFileChooser != null) { pendingFileChooser.onReceiveValue(null); pendingFileChooser = null; }
        if (hostBridge != null) hostBridge.close();
        if (webView != null) {
            webView.removeJavascriptInterface("NXAndroid");
            webView.destroy();
        }
        super.onDestroy();
    }

    /** Native-to-page lifecycle events; the frontend may ignore them. */
    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.evaluateJavascript(
                "window.__nxAndroidLifecycle && window.__nxAndroidLifecycle('focus')", null);
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.evaluateJavascript(
                "window.__nxAndroidLifecycle && window.__nxAndroidLifecycle('blur')", null);
        super.onPause();
    }
}
