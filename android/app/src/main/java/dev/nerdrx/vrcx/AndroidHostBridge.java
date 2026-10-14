package dev.nerdrx.vrcx;

import android.content.ContentResolver;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteStatement;
import android.database.sqlite.SQLiteProgram;
import android.database.sqlite.SQLiteCursor;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.HttpCookie;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Date;
import java.text.SimpleDateFormat;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Callable;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Narrow asynchronous JavaScript bridge. All network and SQLite work stays off the UI thread. */
final class AndroidHostBridge {
    private static final String KEY_ALIAS = "vrcx.private-store.v1";
    private static final String PREFS = "vrcx.private-store";
    private static final String COOKIE_PREFS = "vrcx.session-private";
    private static final int MAX_REDIRECTS = 5;
    private final MainActivity activity;
    private final WebView webView;
    private final ExecutorService orderedExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService networkExecutor = new ThreadPoolExecutor(4, 4, 0L,
            TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(256), new ThreadPoolExecutor.AbortPolicy());
    private final Object dbLock = new Object();
    private SQLiteDatabase database;
    private long sessionGeneration;
    private volatile boolean closed;

    AndroidHostBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public void postMessage(String requestJson) {
        final JSONObject request;
        try {
            request = new JSONObject(requestJson);
            Object id = request.get("id");
            String className = request.getString("className");
            String methodName = request.getString("methodName");
            JSONArray args = request.optJSONArray("args");
            if (args == null) args = new JSONArray();
            final JSONArray callArgs = args;
            activity.verifyTrustedOrigin(trusted -> {
                if (!trusted) {
                    complete(id, null, "Untrusted WebView origin");
                    return;
                }
                boolean appApi = "AppApi".equals(className) || "AppApiElectron".equals(className);
                if (appApi && "ImportHistory".equals(methodName)) {
                    activity.startHistoryImport(id);
                    return;
                }
                if (appApi && "RequestNotificationPermission".equals(methodName)) {
                    activity.requestNotificationPermission(id);
                    return;
                }
                ExecutorService executor = executorFor(className, methodName);
                try {
                    executor.execute(() -> {
                        try {
                            Object result = dispatch(className, methodName, callArgs);
                            complete(id, result, null);
                        } catch (Exception e) {
                            complete(id, null, safeMessage(e));
                        }
                    });
                } catch (Exception e) {
                    complete(id, null, "Native request queue is full");
                }
            });
        } catch (Exception e) {
            // Malformed bridge messages have no trustworthy id to reply to.
        }
    }

    ExecutorService executorFor(String className, String method) {
        return "WebApi".equals(className) &&
                ("Execute".equals(method) || "ExecuteJson".equals(method))
                ? networkExecutor : orderedExecutor;
    }

    Object dispatch(String className, String method, JSONArray args) throws Exception {
        switch (className) {
            case "SQLite":
            case "DatabaseApi":
                return sqlite(method, args);
            case "WebApi":
                return webApi(method, args);
            case "VRCXStorage":
                return storage(method, args);
            case "Discord":
                return discord(method, args);
            case "AssetBundleManager":
                return assetBundle(method, args);
            case "LogWatcher":
                return logWatcher(method, args);
            case "AppApi":
            case "AppApiElectron":
                return appApi(method, args);
            default:
                throw new IllegalArgumentException("Unsupported native class: " + className);
        }
    }

    Object sqlite(String method, JSONArray args) throws Exception {
        String sql = args.getString(0);
        JSONObject named = args.optJSONObject(1);
        BoundSql bound = bindNamedParameters(sql, named);
        synchronized (dbLock) {
            SQLiteDatabase db = database();
            if ("Execute".equals(method) || "ExecuteJson".equals(method)) {
                JSONArray rows = new JSONArray();
                try (Cursor cursor = db.rawQueryWithFactory((connection, driver, table, query) -> {
                    bindStatement(query, bound.typedValues);
                    return new SQLiteCursor(driver, table, query);
                }, bound.sql, null, null)) {
                    while (cursor.moveToNext()) {
                        JSONArray row = new JSONArray();
                        for (int i = 0; i < cursor.getColumnCount(); i++) row.put(cursorValue(cursor, i));
                        rows.put(row);
                    }
                }
                return "ExecuteJson".equals(method) ? rows.toString() : rows;
            }
            Object[] values = bound.typedValues;
            if ("ExecuteNonQuery".equals(method)) {
                String normalized = bound.sql.trim().toUpperCase(Locale.ROOT);
                if (normalized.startsWith("INSERT ") || normalized.startsWith("INSERT\n") ||
                        normalized.startsWith("REPLACE ") || normalized.startsWith("REPLACE\n")) {
                    try (SQLiteStatement statement = db.compileStatement(bound.sql)) {
                        bindStatement(statement, values);
                        return statement.executeInsert() == -1 ? 0 : 1;
                    }
                }
                if (normalized.startsWith("UPDATE ") || normalized.startsWith("UPDATE\n") ||
                        normalized.startsWith("DELETE ") || normalized.startsWith("DELETE\n")) {
                    try (SQLiteStatement statement = db.compileStatement(bound.sql)) {
                        bindStatement(statement, values);
                        return statement.executeUpdateDelete();
                    }
                }
                db.execSQL(bound.sql, values);
                return 0;
            }
            if ("ExecuteInsert".equals(method)) {
                try (SQLiteStatement statement = db.compileStatement(bound.sql)) {
                    bindStatement(statement, values);
                    long rowId = statement.executeInsert();
                    return rowId < 0 ? 0 : rowId;
                }
            }
            throw new IllegalArgumentException("Unsupported SQLite method: " + method);
        }
    }

    private SQLiteDatabase database() {
        if (database == null || !database.isOpen()) {
            File file = activity.getDatabasePath("vrcx.sqlite3");
            File parent = file.getParentFile();
            if (parent != null) parent.mkdirs();
            database = SQLiteDatabase.openOrCreateDatabase(file, null);
            database.enableWriteAheadLogging();
        }
        return database;
    }

    private Object cursorValue(Cursor cursor, int index) {
        if (cursor.isNull(index)) return JSONObject.NULL;
        switch (cursor.getType(index)) {
            case Cursor.FIELD_TYPE_INTEGER: return cursor.getLong(index);
            case Cursor.FIELD_TYPE_FLOAT: return cursor.getDouble(index);
            case Cursor.FIELD_TYPE_BLOB: return Base64.encodeToString(cursor.getBlob(index), Base64.NO_WRAP);
            default: return cursor.getString(index);
        }
    }

    static final class BoundSql {
        final String sql;
        final String[] stringValues;
        final Object[] typedValues;

        BoundSql(String sql, List<Object> values) {
            this.sql = sql;
            this.stringValues = new String[values.size()];
            this.typedValues = values.toArray(new Object[0]);
            for (int i = 0; i < values.size(); i++) {
                Object value = values.get(i);
                stringValues[i] = value == null ? null : String.valueOf(value);
            }
        }
    }

    /** Replace named placeholders while leaving SQL strings, identifiers and comments untouched. */
    static BoundSql bindNamedParameters(String sql, JSONObject params) throws JSONException {
        if (sql == null) throw new IllegalArgumentException("SQL is required");
        StringBuilder out = new StringBuilder(sql.length());
        List<Object> values = new ArrayList<>();
        char quote = 0;
        boolean lineComment = false;
        boolean blockComment = false;
        for (int i = 0; i < sql.length(); i++) {
            char c = sql.charAt(i);
            char next = i + 1 < sql.length() ? sql.charAt(i + 1) : 0;
            if (lineComment) {
                out.append(c);
                if (c == '\n') lineComment = false;
                continue;
            }
            if (blockComment) {
                out.append(c);
                if (c == '*' && next == '/') {
                    out.append(next);
                    i++;
                    blockComment = false;
                }
                continue;
            }
            if (quote != 0) {
                out.append(c);
                if (c == quote) {
                    if (next == quote) {
                        out.append(next);
                        i++;
                    } else {
                        quote = 0;
                    }
                } else if (quote == ']' && c == ']') {
                    quote = 0;
                }
                continue;
            }
            if (c == '-' && next == '-') {
                out.append(c).append(next);
                i++;
                lineComment = true;
            } else if (c == '/' && next == '*') {
                out.append(c).append(next);
                i++;
                blockComment = true;
            } else if (c == '\'' || c == '"' || c == '`' || c == '[') {
                quote = c == '[' ? ']' : c;
                out.append(c);
            } else if ((c == '@' || c == ':' || c == '$') && isNameStart(next)) {
                int end = i + 2;
                while (end < sql.length() && isNamePart(sql.charAt(end))) end++;
                String name = sql.substring(i, end);
                if (params == null || !params.has(name)) {
                    throw new IllegalArgumentException("Missing SQL parameter: " + name);
                }
                Object value = params.get(name);
                values.add(value == JSONObject.NULL ? null : value);
                out.append('?');
                i = end - 1;
            } else {
                out.append(c);
            }
        }
        if (quote != 0 || blockComment) throw new IllegalArgumentException("Unterminated SQL quote or comment");
        return new BoundSql(out.toString(), values);
    }

    private static boolean isNameStart(char c) {
        return c == '_' || Character.isLetter(c);
    }

    private static boolean isNamePart(char c) {
        return c == '_' || Character.isLetterOrDigit(c);
    }

    private static void bindStatement(SQLiteProgram statement, Object[] values) {
        for (int i = 0; i < values.length; i++) {
            int slot = i + 1;
            Object value = values[i];
            if (value == null || value == JSONObject.NULL) statement.bindNull(slot);
            else if (value instanceof Number) {
                Number number = (Number) value;
                if (value instanceof Double || value instanceof Float) statement.bindDouble(slot, number.doubleValue());
                else statement.bindLong(slot, number.longValue());
            } else if (value instanceof Boolean) statement.bindLong(slot, (Boolean) value ? 1 : 0);
            else if (value instanceof byte[]) statement.bindBlob(slot, (byte[]) value);
            else statement.bindString(slot, String.valueOf(value));
        }
    }

    private Object webApi(String method, JSONArray args) throws Exception {
        switch (method) {
            case "ExecuteJson": {
                JSONObject options = new JSONObject(args.getString(0));
                JSONObject response = executeHttp(options);
                return response.toString();
            }
            case "Execute": {
                JSONObject response = executeHttp(args.getJSONObject(0));
                return new JSONObject().put("Item1", response.getInt("status"))
                        .put("Item2", response.getString("message"));
            }
            case "GetCookies": return getCookieBundle();
            case "SetCookies": setCookieBundle(args.getString(0)); return null;
            case "ClearCookies": clearCookieBundle(); return null;
            default: throw new IllegalArgumentException("Unsupported WebApi method: " + method);
        }
    }

    private JSONObject executeHttp(JSONObject options) throws Exception {
        String rawUrl = options.getString("url");
        String method = options.optString("method", "GET").toUpperCase(Locale.ROOT);
        if (options.has("uploadImage") || options.has("uploadImageLegacy") ||
                options.has("uploadImagePrint") || options.has("uploadFilePUT")) {
            return new JSONObject().put("status", -1).put("message", "Android host does not support file uploads");
        }
        URL url = new URL(rawUrl);
        if (!"https".equalsIgnoreCase(url.getProtocol()) || url.getUserInfo() != null) {
            return new JSONObject().put("status", -1).put("message", "HTTPS is required");
        }
        String initialOrigin = origin(url);
        final long requestSession;
        synchronized (this) { requestSession = sessionGeneration; }
        boolean forwardSensitiveHeaders = true;
        String requestBody = options.optString("body", null);
        JSONObject headers = options.optJSONObject("headers");
        String responseBody = "";
        for (int redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(30000);
            connection.setRequestMethod(method);
            if (!hasHeader(headers, "User-Agent")) {
                connection.setRequestProperty("User-Agent", "VRCX Android/" + appVersion());
            }
            if (headers != null) {
                Iterator<String> names = headers.keys();
                while (names.hasNext()) {
                    String name = names.next();
                    if ("cookie".equalsIgnoreCase(name) || "host".equalsIgnoreCase(name)) continue;
                    if (!forwardSensitiveHeaders && isSensitiveHeader(name)) continue;
                    connection.setRequestProperty(name, headers.getString(name));
                }
            }
            if (isVrchatHost(url.getHost())) {
                synchronized (this) {
                    if (requestSession != sessionGeneration) throw new IllegalStateException("Account session changed; request cancelled");
                    String cookie = cookieHeader(url);
                    if (!cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
                }
            }
            if (requestBody != null && !"GET".equals(method) && !"HEAD".equals(method)) {
                connection.setDoOutput(true);
                byte[] bytes = requestBody.getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (isVrchatHost(url.getHost())) {
                synchronized (this) {
                    if (requestSession != sessionGeneration) throw new IllegalStateException("Account session changed; request cancelled");
                    for (Map.Entry<String, List<String>> header : connection.getHeaderFields().entrySet()) {
                        if ("set-cookie".equalsIgnoreCase(header.getKey())) storeResponseCookies(url, header.getValue());
                    }
                    String route = url.getPath();
                    if (route.equals("/api/1/auth/user") || route.startsWith("/api/1/auth/twofactorauth/") ||
                            route.equals("/api/1/auth/user/friends")) {
                        // Only route/status and cookie presence: never log credentials, codes, or response bodies.
                        String cookies = cookieHeader(url);
                        Log.i("VRCXSession", "HTTP " + status + " " + route +
                                " auth=" + (cookies.startsWith("auth=") || cookies.contains("; auth=")) +
                                " twoFactor=" + (cookies.startsWith("twoFactorAuth=") || cookies.contains("; twoFactorAuth=")));
                    }
                }
            }
            if (status >= 300 && status < 400) {
                String location = connection.getHeaderField("Location");
                if (location == null || redirect == MAX_REDIRECTS) break;
                URL next = new URL(url, location);
                if (!"https".equalsIgnoreCase(next.getProtocol()) || next.getUserInfo() != null) {
                    return new JSONObject().put("status", -1).put("message", "Refused non-HTTPS redirect");
                }
                if (!initialOrigin.equals(origin(next))) {
                    forwardSensitiveHeaders = false;
                    requestBody = null;
                }
                url = next;
                continue;
            }
            String contentType = connection.getContentType();
            InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (input != null) {
                byte[] bytes = readFully(input);
                if (contentType != null && (contentType.toLowerCase(Locale.ROOT).contains("image/") ||
                        contentType.toLowerCase(Locale.ROOT).contains("application/octet-stream"))) {
                    String mime = contentType.split(";", 2)[0].trim();
                    responseBody = "data:" + mime + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
                } else {
                    responseBody = new String(bytes, StandardCharsets.UTF_8);
                }
            }
            return new JSONObject().put("status", status).put("message", responseBody);
            } finally {
                connection.disconnect();
            }
        }
        return new JSONObject().put("status", -1).put("message", "Too many or invalid redirects");
    }

    private static boolean isSensitiveHeader(String name) {
        return "authorization".equalsIgnoreCase(name) || "proxy-authorization".equalsIgnoreCase(name) ||
                "x-vrcx-auth".equalsIgnoreCase(name);
    }

    private static boolean hasHeader(JSONObject headers, String expected) {
        if (headers == null) return false;
        Iterator<String> names = headers.keys();
        while (names.hasNext()) if (expected.equalsIgnoreCase(names.next())) return true;
        return false;
    }

    private String appVersion() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (Exception ignored) {
            return "unknown";
        }
    }

    static String origin(URL url) {
        int port = url.getPort() == -1 ? url.getDefaultPort() : url.getPort();
        return url.getProtocol().toLowerCase(Locale.ROOT) + "://" +
                url.getHost().toLowerCase(Locale.ROOT) + ":" + port;
    }

    private static boolean isVrchatHost(String host) {
        String h = host.toLowerCase(Locale.ROOT);
        return h.equals("vrchat.cloud") || h.endsWith(".vrchat.cloud") ||
                h.equals("vrchat.com") || h.endsWith(".vrchat.com");
    }

    Object storage(String method, JSONArray args) throws Exception {
        switch (method) {
            case "Get": return decryptPreference(args.getString(0));
            case "Set": encryptPreference(args.getString(0), args.getString(1)); return null;
            case "Remove":
                activity.getSharedPreferences(PREFS, 0).edit().remove(args.getString(0)).apply();
                return null;
            case "GetAll": {
                JSONObject all = new JSONObject();
                for (Map.Entry<String, ?> entry : activity.getSharedPreferences(PREFS, 0).getAll().entrySet()) {
                    if (entry.getValue() instanceof String) all.put(entry.getKey(), decryptStoredValue((String) entry.getValue()));
                }
                return all.toString();
            }
            case "Save": case "Flush": case "Load": return null;
            default: throw new IllegalArgumentException("Unsupported VRCXStorage method: " + method);
        }
    }

    private static final String COOKIE_STORAGE_KEY = "__vrcx_cookie_bundle";

    synchronized String getCookieBundle() throws Exception {
        JSONArray cookies = currentCookies();
        return Base64.encodeToString(cookies.toString().getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
    }

    synchronized void setCookieBundle(String encoded) throws Exception {
        JSONArray imported = new JSONArray(new String(Base64.decode(encoded, Base64.DEFAULT), StandardCharsets.UTF_8));
        JSONArray accepted = new JSONArray();
        for (int i = 0; i < imported.length(); i++) {
            JSONObject input = imported.getJSONObject(i);
            String domain = input.optString("Domain", input.optString("domain", ""))
                    .toLowerCase(Locale.ROOT).replaceFirst("^\\.", "");
            String name = input.optString("Name", input.optString("name", ""));
            if (!isVrchatHost(domain) || name.isEmpty()) continue;
            JSONObject cookie = new JSONObject();
            cookie.put("Domain", domain);
            cookie.put("HostOnly", input.optBoolean("HostOnly", input.optBoolean("hostOnly", false)));
            cookie.put("Path", input.optString("Path", input.optString("path", "/")));
            cookie.put("Name", name);
            cookie.put("Value", input.optString("Value", input.optString("value", "")));
            cookie.put("Secure", input.optBoolean("Secure", input.optBoolean("secure", true)));
            cookie.put("HttpOnly", input.optBoolean("HttpOnly", input.optBoolean("httpOnly", false)));
            long maxAge = input.optLong("MaxAge", -1);
            String expires = input.optString("Expires", input.optString("expires", ""));
            if (maxAge >= 0 && expires.isEmpty()) expires = String.valueOf(System.currentTimeMillis() + maxAge * 1000L);
            cookie.put("Expires", expires);
            cookie.put("MaxAge", -1);
            accepted.put(cookie);
        }
        encryptCookieBundle(accepted.toString());
        sessionGeneration++;
    }

    synchronized void clearCookieBundle() throws Exception {
        encryptCookieBundle("[]");
        sessionGeneration++;
    }

    private synchronized JSONArray currentCookies() throws Exception {
        String raw = decryptCookieBundle();
        return raw.isEmpty() ? new JSONArray() : new JSONArray(raw);
    }

    synchronized String cookieHeader(URL url) throws Exception {
        JSONArray cookies = currentCookies();
        String host = url.getHost().toLowerCase(Locale.ROOT);
        String path = url.getPath().isEmpty() ? "/" : url.getPath();
        List<String> pairs = new ArrayList<>();
        long now = System.currentTimeMillis();
        for (int i = cookies.length() - 1; i >= 0; i--) {
            JSONObject cookie = cookies.getJSONObject(i);
            String domain = cookie.optString("Domain", "").toLowerCase(Locale.ROOT);
            String cookiePath = cookie.optString("Path", "/");
            long expires = parseCookieExpiry(cookie);
            boolean domainMatch = cookie.optBoolean("HostOnly", false)
                    ? host.equals(domain) : cookieDomainMatches(host, domain);
            boolean pathMatch = path.equals(cookiePath) || path.startsWith(cookiePath.endsWith("/") ? cookiePath : cookiePath + "/");
            if (!domainMatch || !pathMatch || (expires > 0 && expires <= now) ||
                    (cookie.optBoolean("Secure") && !"https".equalsIgnoreCase(url.getProtocol()))) continue;
            pairs.add(cookie.getString("Name") + "=" + cookie.optString("Value", ""));
        }
        return android.text.TextUtils.join("; ", pairs);
    }

    synchronized void storeResponseCookies(URL url, List<String> headers) throws Exception {
        if (headers == null || headers.isEmpty()) return;
        JSONArray current = currentCookies();
        String host = url.getHost().toLowerCase(Locale.ROOT);
        String path = url.getPath();
        int slash = path.lastIndexOf('/');
        String defaultPath = slash <= 0 ? "/" : path.substring(0, slash);
        for (String header : headers) {
            List<HttpCookie> parsed;
            try { parsed = HttpCookie.parse(header); } catch (IllegalArgumentException ignored) { continue; }
            for (HttpCookie parsedCookie : parsed) {
                String domain = parsedCookie.getDomain();
                boolean hostOnly = domain == null || domain.isEmpty();
                if (hostOnly) domain = host;
                domain = domain.toLowerCase(Locale.ROOT);
                if (domain.startsWith(".")) domain = domain.substring(1);
                if (!cookieDomainMatches(host, domain) || !isVrchatHost(domain)) continue;
                String cookiePath = parsedCookie.getPath();
                if (cookiePath == null || !cookiePath.startsWith("/")) cookiePath = defaultPath;
                String expiresAttribute = cookieAttribute(header, "expires");
                long expiresAt = parsedCookie.getMaxAge() >= 0
                        ? System.currentTimeMillis() + parsedCookie.getMaxAge() * 1000L
                        : parseCookieDate(expiresAttribute);
                boolean remove = parsedCookie.hasExpired() || (expiresAt > 0 && expiresAt <= System.currentTimeMillis());
                JSONArray next = new JSONArray();
                for (int i = 0; i < current.length(); i++) {
                    JSONObject existing = current.getJSONObject(i);
                    boolean same = domain.equalsIgnoreCase(existing.optString("Domain")) &&
                            cookiePath.equals(existing.optString("Path")) &&
                            parsedCookie.getName().equals(existing.optString("Name"));
                    if (!same) next.put(existing);
                }
                current = next;
                if (!remove) {
                    JSONObject cookie = new JSONObject();
                    cookie.put("Domain", domain);
                    cookie.put("HostOnly", hostOnly);
                    cookie.put("Path", cookiePath);
                    cookie.put("Name", parsedCookie.getName());
                    cookie.put("Value", parsedCookie.getValue());
                    cookie.put("Secure", parsedCookie.getSecure());
                    cookie.put("HttpOnly", header.toLowerCase(Locale.ROOT).contains("; httponly"));
                    cookie.put("MaxAge", -1);
                    cookie.put("Expires", expiresAt > 0 ? String.valueOf(expiresAt) : "");
                    current.put(cookie);
                }
            }
        }
        encryptCookieBundle(current.toString());
    }

    static boolean cookieDomainMatches(String host, String domain) {
        String normalized = domain.toLowerCase(Locale.ROOT).replaceFirst("^\\.", "");
        String issuingHost = host.toLowerCase(Locale.ROOT);
        return issuingHost.equals(normalized) || issuingHost.endsWith("." + normalized);
    }

    private long parseCookieExpiry(JSONObject cookie) {
        String raw = cookie.optString("Expires", "");
        if (raw.isEmpty()) return 0;
        try { return Long.parseLong(raw); } catch (NumberFormatException ignored) { }
        return parseCookieDate(raw);
    }

    private static long parseCookieDate(String raw) {
        if (raw == null || raw.isEmpty()) return 0;
        try {
            SimpleDateFormat format = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", Locale.US);
            format.setLenient(false);
            Date date = format.parse(raw.trim());
            return date == null ? 0 : date.getTime();
        } catch (Exception ignored) {
            try { return java.time.Instant.parse(raw.trim()).toEpochMilli(); }
            catch (Exception ignoredAgain) { return 0; }
        }
    }

    private static String cookieAttribute(String header, String name) {
        for (String part : header.split(";")) {
            int equals = part.indexOf('=');
            if (equals > 0 && name.equalsIgnoreCase(part.substring(0, equals).trim())) {
                return part.substring(equals + 1).trim();
            }
        }
        return "";
    }

    int[] importHistoryRows(SQLiteDatabase source) {
        synchronized (dbLock) {
            SQLiteDatabase target = database();
            // The import is available before the first account login.
            target.execSQL("CREATE TABLE IF NOT EXISTS gamelog_location (id INTEGER PRIMARY KEY, created_at TEXT, location TEXT, world_id TEXT, world_name TEXT, time INTEGER, group_name TEXT, UNIQUE(created_at, location))");
            target.execSQL("CREATE TABLE IF NOT EXISTS gamelog_join_leave (id INTEGER PRIMARY KEY, created_at TEXT, type TEXT, display_name TEXT, location TEXT, user_id TEXT, time INTEGER, UNIQUE(created_at, type, display_name))");
            int locations = 0;
            int joins = 0;
            target.beginTransaction();
            try {
                try (Cursor rows = source.rawQuery("SELECT created_at, location, world_id, world_name, time, group_name FROM gamelog_location", null)) {
                    while (rows.moveToNext()) {
                        ContentValues values = new ContentValues();
                        putCursorValue(values, "created_at", rows, 0);
                        putCursorValue(values, "location", rows, 1);
                        putCursorValue(values, "world_id", rows, 2);
                        putCursorValue(values, "world_name", rows, 3);
                        putCursorValue(values, "time", rows, 4);
                        putCursorValue(values, "group_name", rows, 5);
                        if (target.insertWithOnConflict("gamelog_location", null, values, SQLiteDatabase.CONFLICT_IGNORE) != -1) locations++;
                    }
                }
                try (Cursor rows = source.rawQuery("SELECT created_at, type, display_name, location, user_id, time FROM gamelog_join_leave", null)) {
                    while (rows.moveToNext()) {
                        ContentValues values = new ContentValues();
                        putCursorValue(values, "created_at", rows, 0);
                        putCursorValue(values, "type", rows, 1);
                        putCursorValue(values, "display_name", rows, 2);
                        putCursorValue(values, "location", rows, 3);
                        putCursorValue(values, "user_id", rows, 4);
                        putCursorValue(values, "time", rows, 5);
                        if (target.insertWithOnConflict("gamelog_join_leave", null, values, SQLiteDatabase.CONFLICT_IGNORE) != -1) joins++;
                    }
                }
                target.setTransactionSuccessful();
            } finally {
                target.endTransaction();
            }
            return new int[]{locations, joins};
        }
    }

    private static void putCursorValue(android.content.ContentValues values, String key, Cursor cursor, int index) {
        if (cursor.isNull(index)) values.putNull(key);
        else switch (cursor.getType(index)) {
            case Cursor.FIELD_TYPE_INTEGER: values.put(key, cursor.getLong(index)); break;
            case Cursor.FIELD_TYPE_FLOAT: values.put(key, cursor.getDouble(index)); break;
            case Cursor.FIELD_TYPE_BLOB: values.put(key, cursor.getBlob(index)); break;
            default: values.put(key, cursor.getString(index)); break;
        }
    }

    private Object appApi(String method, JSONArray args) throws Exception {
        switch (method) {
            case "CurrentLanguage": return Locale.getDefault().toLanguageTag();
            case "CurrentCulture": return Locale.getDefault().toLanguageTag();
            case "GetVersion": {
                String version = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
                return "VRCX (Android) " + BuildConfig.VRCX_VERSION + " / " + version;
            }
            case "GetColourFromUserID": return colorForUser(args.getString(0));
            case "GetColourBulk": {
                JSONArray userIds = args.getJSONArray(0);
                JSONObject result = new JSONObject();
                for (int i = 0; i < userIds.length(); i++) {
                    String userId = userIds.getString(i);
                    result.put(userId, colorForUser(userId));
                }
                return result;
            }
            case "GetLaunchCommand": case "CustomCss": case "CustomScript": return "";
            case "GetVRChatRegistryKeyString": return "";
            case "GetVRChatRegistryKey": return null;
            case "HasVRChatRegistryFolder": return false;
            case "GetVRChatUserModeration": return 0; // No PC-local avatar preferences on a phone.
            case "SetVRChatUserModeration": return false;
            case "SetUserAgent": case "IPCAnnounceStart": case "FlashWindow": case "CheckGameRunning": case "ChangeTheme":
            case "FocusWindow": case "SetTrayIconNotification": case "SetStartup": case "SetAppLauncherSettings":
            case "SetVR": case "SetZoom": case "RestartApplication": case "CancelUpdate":
            case "SendIpc": case "OpenCalendarFile": return null;
            case "GetZoom": return 0.0;
            case "IsGameRunning": case "IsSteamVRRunning": case "CheckForUpdateExe": return false;
            case "VrcClosedGracefully": return false;
            case "PopulateImageHosts": case "ExecuteVrOverlayFunction": return null;
            case "OpenLink": activity.openLink(args.getString(0)); return null;
            case "GetClipboard": return activity.readClipboard();
            case "DesktopNotification":
                activity.notifyUser(args.optString(0, "VRCX"), args.optString(1, ""));
                return null;
            case "GetNotificationPermission":
                return android.os.Build.VERSION.SDK_INT < 33 ||
                        activity.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED;
            case "ImportHistory": throw new IllegalStateException("History import requires an activity result");
            default: throw new IllegalArgumentException("Unsupported AppApi method: " + method);
        }
    }

    private Object discord(String method, JSONArray args) throws Exception {
        switch (method) {
            case "SetActive": return false;
            case "SetAssets": return null;
            default: throw new IllegalArgumentException("Unsupported Discord method: " + method);
        }
    }

    private Object assetBundle(String method, JSONArray args) throws Exception {
        switch (method) {
            case "GetCacheSize": return 0;
            case "GetVRChatCacheFullLocation": return "";
            case "CheckVRChatCache":
                return new JSONObject().put("Item1", -1).put("Item2", false).put("Item3", "");
            default: throw new IllegalArgumentException("Unsupported AssetBundleManager method: " + method);
        }
    }

    private Object logWatcher(String method, JSONArray args) throws Exception {
        switch (method) {
            case "Get": case "GetLogLines": return new JSONArray();
            case "SetDateTill": case "Reset": return null;
            default: throw new IllegalArgumentException("Unsupported LogWatcher method: " + method);
        }
    }

    private static int colorForUser(String userId) throws Exception {
        byte[] hash = MessageDigest.getInstance("MD5").digest(userId.getBytes(StandardCharsets.UTF_8));
        return (hash[3] << 8) | hash[4];
    }

    private byte[] readFully(InputStream input) throws Exception {
        try (InputStream in = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            long total = 0;
            while ((count = in.read(buffer)) != -1) {
                total += count;
                if (total > 64L * 1024L * 1024L) throw new IllegalArgumentException("HTTP response exceeds 64 MiB");
                out.write(buffer, 0, count);
            }
            return out.toByteArray();
        }
    }

    private static String safeMessage(Exception e) {
        String message = e.getMessage();
        return message == null || message.isEmpty() ? e.getClass().getSimpleName() : message;
    }

    private void complete(Object id, Object result, String error) {
        if (closed) return;
        try {
            JSONObject response = new JSONObject().put("id", id);
            if (error == null) response.put("result", result == null ? JSONObject.NULL : result);
            else response.put("error", error);
            String script = "window.__nxAndroidResult && window.__nxAndroidResult(" + response + ")";
            activity.runOnUiThread(() -> webView.evaluateJavascript(script, null));
        } catch (Exception ignored) {
        }
    }

    void completeImport(Object id, Object result, String error) {
        complete(id, result, error);
    }

    void queueHistoryImport(Object id, Callable<JSONObject> work) {
        try {
            orderedExecutor.execute(() -> {
                try { complete(id, work.call(), null); }
                catch (Exception e) { complete(id, null, safeMessage(e)); }
            });
        } catch (Exception e) {
            complete(id, null, "Native request queue is full");
        }
    }

    void completePermission(Object id, boolean granted, String error) {
        complete(id, granted, error);
    }

    void close() {
        closed = true;
        orderedExecutor.shutdownNow();
        networkExecutor.shutdownNow();
        synchronized (dbLock) {
            if (database != null && database.isOpen()) database.close();
            database = null;
        }
    }

    private String decryptPreference(String key) throws Exception {
        return decryptStoredValue(activity.getSharedPreferences(PREFS, 0).getString(key, ""));
    }

    private String decryptCookieBundle() throws Exception {
        return decryptStoredValue(activity.getSharedPreferences(COOKIE_PREFS, 0).getString(COOKIE_STORAGE_KEY, ""));
    }

    private String decryptStoredValue(String stored) throws Exception {
        if (!stored.startsWith("enc:")) return stored;
        byte[] blob = Base64.decode(stored.substring(4), Base64.NO_WRAP);
        byte[] iv = new byte[12];
        System.arraycopy(blob, 0, iv, 0, iv.length);
        byte[] ciphertext = new byte[blob.length - iv.length];
        System.arraycopy(blob, iv.length, ciphertext, 0, ciphertext.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }

    private void encryptPreference(String key, String value) throws Exception {
        encryptStoredValue(activity.getSharedPreferences(PREFS, 0), key, value);
    }

    private void encryptCookieBundle(String value) throws Exception {
        encryptStoredValue(activity.getSharedPreferences(COOKIE_PREFS, 0), COOKIE_STORAGE_KEY, value);
    }

    private void encryptStoredValue(android.content.SharedPreferences preferences, String key, String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, secretKey());
        byte[] iv = cipher.getIV();
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] blob = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, blob, 0, iv.length);
        System.arraycopy(encrypted, 0, blob, iv.length, encrypted.length);
        preferences.edit()
                .putString(key, "enc:" + Base64.encodeToString(blob, Base64.NO_WRAP)).apply();
    }

    private SecretKey secretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        java.security.Key key = keyStore.getKey(KEY_ALIAS, null);
        if (key instanceof SecretKey) return (SecretKey) key;
        KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
        android.security.keystore.KeyGenParameterSpec spec = new android.security.keystore.KeyGenParameterSpec.Builder(
                KEY_ALIAS, android.security.keystore.KeyProperties.PURPOSE_ENCRYPT |
                android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build();
        generator.init(spec);
        return generator.generateKey();
    }

    // Cookie helpers and history import are appended below.
}
