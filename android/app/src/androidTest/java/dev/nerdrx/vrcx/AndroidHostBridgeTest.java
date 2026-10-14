package dev.nerdrx.vrcx;

import android.net.Uri;
import android.test.InstrumentationTestCase;
import android.content.Intent;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;

import org.json.JSONObject;

import java.net.URL;
import java.util.Collections;

/** Contract checks for SQL binding and the WebView navigation boundary. */
public final class AndroidHostBridgeTest extends InstrumentationTestCase {
    public void testTwoFactorCookiesSurviveVerificationAndRestoringSession() throws Exception {
        MainActivity activity = (MainActivity) getInstrumentation().startActivitySync(
                new Intent(getInstrumentation().getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        AndroidHostBridge bridge = new AndroidHostBridge(activity, null);
        URL user = new URL("https://api.vrchat.cloud/api/1/auth/user");
        try {
            bridge.clearCookieBundle();
            bridge.storeResponseCookies(user, Collections.singletonList(
                    "auth=synthetic-session; Domain=.api.vrchat.cloud; Path=/; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Secure; HttpOnly; SameSite=None"));
            bridge.storeResponseCookies(new URL("https://api.vrchat.cloud/api/1/auth/twofactorauth/totp/verify"), Collections.singletonList(
                    "twoFactorAuth=synthetic-verified; Domain=.api.vrchat.cloud; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=None"));
            String cookies = bridge.cookieHeader(user);
            assertTrue(cookies.contains("auth=synthetic-session"));
            assertTrue(cookies.contains("twoFactorAuth=synthetic-verified"));
            String saved = bridge.getCookieBundle();
            bridge.clearCookieBundle();
            bridge.setCookieBundle(saved);
            assertEquals(cookies, bridge.cookieHeader(user));
            assertEquals(cookies, bridge.cookieHeader(new URL("https://api.vrchat.cloud/api/1/auth/user/friends")));
            assertEquals("", bridge.cookieHeader(new URL("https://vrchat.com/api/1/auth/user")));
            bridge.storeResponseCookies(user, Collections.singletonList("twoFactorAuth=deleted; Path=/; Domain=.api.vrchat.cloud; Max-Age=0; Secure"));
            assertEquals("auth=synthetic-session", bridge.cookieHeader(user));
        } finally { bridge.clearCookieBundle(); bridge.close(); activity.finish(); }
    }
    public void testHistoryImportIsIdempotentAndKeepsPrivateSettings() throws Exception {
        MainActivity activity = (MainActivity) getInstrumentation().startActivitySync(
                new Intent(getInstrumentation().getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        AndroidHostBridge bridge = new AndroidHostBridge(activity, null);
        String marker = "native-import-test-" + System.nanoTime();
        SQLiteDatabase source = SQLiteDatabase.create(null);
        try {
            source.execSQL("CREATE TABLE gamelog_location (created_at TEXT, location TEXT, world_id TEXT, world_name TEXT, time INTEGER, group_name TEXT)");
            source.execSQL("CREATE TABLE gamelog_join_leave (created_at TEXT, type TEXT, display_name TEXT, location TEXT, user_id TEXT, time INTEGER)");
            source.execSQL("INSERT INTO gamelog_location VALUES (?, 'wrld_test:1', 'wrld_test', 'Test World', 60000, '')", new Object[]{marker});
            source.execSQL("INSERT INTO gamelog_join_leave VALUES (?, 'OnPlayerJoined', 'Sample', 'wrld_test:1', 'usr_test', 0)", new Object[]{marker});
            bridge.storage("Set", new JSONArray().put(marker).put("keep-private"));
            int[] first = bridge.importHistoryRows(source);
            assertEquals(1, first[0]); assertEquals(1, first[1]);
            int[] repeated = bridge.importHistoryRows(source);
            assertEquals(0, repeated[0]); assertEquals(0, repeated[1]);
            assertEquals("keep-private", bridge.storage("Get", new JSONArray().put(marker)));
        } finally {
            JSONObject params = new JSONObject().put("@marker", marker);
            bridge.sqlite("ExecuteNonQuery", new JSONArray().put("DELETE FROM gamelog_location WHERE created_at=@marker").put(params));
            bridge.sqlite("ExecuteNonQuery", new JSONArray().put("DELETE FROM gamelog_join_leave WHERE created_at=@marker").put(params));
            bridge.storage("Remove", new JSONArray().put(marker));
            source.close(); bridge.close(); activity.finish();
        }
    }
    public void testSqlitePreservesNullAndNumbersAndDoesNotInterpolateText() throws Exception {
        MainActivity activity = (MainActivity) getInstrumentation().startActivitySync(
                new Intent(getInstrumentation().getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        AndroidHostBridge bridge = new AndroidHostBridge(activity, null);
        try {
            JSONObject params = new JSONObject().put("@empty", JSONObject.NULL).put("@n", 7)
                    .put("@text", "x' OR 1=1 --");
            JSONArray rows = new JSONArray((String) bridge.sqlite("ExecuteJson", new JSONArray()
                    .put("SELECT @empty IS NULL, typeof(@n), @n, @text").put(params)));
            assertEquals(1, rows.getJSONArray(0).getInt(0));
            assertEquals("integer", rows.getJSONArray(0).getString(1));
            assertEquals(7, rows.getJSONArray(0).getInt(2));
            assertEquals("x' OR 1=1 --", rows.getJSONArray(0).getString(3));
        } finally { bridge.close(); activity.finish(); }
    }
    public void testNamedSqlBindsOnlyOutsideQuotesAndComments() throws Exception {
        JSONObject params = new JSONObject().put("@a", "alpha").put(":b", 7);
        AndroidHostBridge.BoundSql bound = AndroidHostBridge.bindNamedParameters(
                "SELECT '@ignored', \"@column\", [@quoted], `@name`, value " +
                        "FROM t WHERE first=@a AND second=:b -- @comment\n /* @block */",
                params);
        assertEquals("SELECT '@ignored', \"@column\", [@quoted], `@name`, value " +
                "FROM t WHERE first=? AND second=? -- @comment\n /* @block */", bound.sql);
        assertEquals("alpha", bound.stringValues[0]);
        assertEquals("7", bound.stringValues[1]);
        assertEquals(7, ((Number) bound.typedValues[1]).intValue());
    }

    public void testMissingSqlParameterFailsClosed() throws Exception {
        try {
            AndroidHostBridge.bindNamedParameters("SELECT @missing", new JSONObject());
            fail("missing SQL parameters must not become unbound placeholders");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("@missing"));
        }
    }

    public void testLocalOriginAndExternalSchemeAllowlist() {
        assertTrue(MainActivity.isLocalOrigin(Uri.parse("https://vrcx.local/frontend/android.html")));
        assertTrue(MainActivity.isLocalOrigin(Uri.parse("https://vrcx.local:443/frontend/android.html")));
        assertFalse(MainActivity.isLocalOrigin(Uri.parse("https://vrcx.local.attacker.invalid/")));
        assertFalse(MainActivity.isLocalOrigin(Uri.parse("http://vrcx.local/")));
        assertFalse(MainActivity.isLocalOrigin(Uri.parse("https://user@vrcx.local/")));
        assertTrue(MainActivity.isAllowedExternalLink(Uri.parse("https://vrchat.com/home")));
        assertTrue(MainActivity.isAllowedExternalLink(Uri.parse("vrchat://launch?worldId=wrld_test")));
        assertFalse(MainActivity.isAllowedExternalLink(Uri.parse("javascript:alert(1)")));
        assertFalse(MainActivity.isAllowedExternalLink(Uri.parse("http://example.com/")));
    }

    public void testHttpRedirectOriginIncludesSchemeHostAndEffectivePort() throws Exception {
        URL api = new URL("https://api.vrchat.cloud/api/1/auth/user");
        URL sameOrigin = new URL("https://api.vrchat.cloud:443/api/1/auth/user");
        URL otherHost = new URL("https://example.com/api/1/auth/user");
        assertEquals(AndroidHostBridge.origin(api), AndroidHostBridge.origin(sameOrigin));
        assertFalse(AndroidHostBridge.origin(api).equals(AndroidHostBridge.origin(otherHost)));
    }

    public void testEncryptedStorageGetAllReturnsValuesAndExcludesSessionCookies() throws Exception {
        MainActivity activity = (MainActivity) getInstrumentation().startActivitySync(
                new Intent(getInstrumentation().getTargetContext(), MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        AndroidHostBridge bridge = new AndroidHostBridge(activity, null);
        String key = "android-test-" + System.nanoTime();
        try {
            bridge.storage("Set", new JSONArray().put(key).put("private-value"));
            bridge.clearCookieBundle();
            String stored = activity.getSharedPreferences("vrcx.private-store", 0).getString(key, "");
            assertTrue(stored.startsWith("enc:"));
            JSONObject all = new JSONObject((String) bridge.storage("GetAll", new JSONArray()));
            assertEquals("private-value", all.getString(key));
            assertFalse(all.has("__vrcx_cookie_bundle"));
        } finally {
            activity.getSharedPreferences("vrcx.private-store", 0).edit().remove(key).apply();
            bridge.clearCookieBundle();
            bridge.close();
            activity.finish();
        }
    }

    public void testCookieScopeAndResponseDomainValidation() throws Exception {
        MainActivity activity = (MainActivity) getInstrumentation().startActivitySync(
                new Intent(getInstrumentation().getTargetContext(), MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        AndroidHostBridge bridge = new AndroidHostBridge(activity, null);
        try {
            bridge.clearCookieBundle();
            bridge.storeResponseCookies(new URL("https://api.vrchat.cloud/auth"),
                    Collections.singletonList("session=bad; Domain=attacker.invalid; Path=/; Secure"));
            bridge.storeResponseCookies(new URL("https://api.vrchat.cloud/auth"),
                    Collections.singletonList("session=good; Path=/; Secure; HttpOnly"));
            assertEquals("session=good", bridge.cookieHeader(new URL("https://api.vrchat.cloud/api")));
            assertEquals("", bridge.cookieHeader(new URL("https://www.vrchat.cloud/api")));
            assertFalse(AndroidHostBridge.cookieDomainMatches("evil.invalid", "vrchat.cloud"));
            assertTrue(AndroidHostBridge.cookieDomainMatches("api.vrchat.cloud", ".vrchat.cloud"));
        } finally {
            bridge.clearCookieBundle();
            bridge.close();
            activity.finish();
        }
    }
}
