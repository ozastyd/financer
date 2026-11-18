package id.my.financer.app

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * What this phone keeps for automatic recording, in app-private storage:
 * the device token and endpoint from connecting, and a queue of bank/e-wallet
 * notifications waiting to be sent.
 */
object NotificationStore {
    /** Apps whose notifications are read (same list as the server's parse.ts). Everything else is dropped. */
    val ALLOWED: Set<String> = setOf(
        "com.bca.mybca.omni.android", // myBCA
        "id.bmri.livin",              // Livin' by Mandiri
        "id.co.bri.brimo",            // BRImo
        "id.dana",                    // DANA
        "com.shopee.id",              // Shopee (ShopeePay)
        "com.gojek.gopay",            // GoPay
        "com.gojek.app",              // Gojek (GoPay inside)
        "ovo.id",                     // OVO
    )

    private const val PREFS = "financer_auto_record"
    private const val QUEUE_MAX = 500
    private const val RECENT_MAX = 100

    private fun prefs(c: Context): SharedPreferences = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun token(c: Context): String? = prefs(c).getString("token", null)
    fun deviceId(c: Context): String? = prefs(c).getString("deviceId", null)
    fun endpoint(c: Context): String? = prefs(c).getString("endpoint", null)

    fun connect(c: Context, token: String, deviceId: String, endpoint: String) {
        prefs(c).edit().putString("token", token).putString("deviceId", deviceId).putString("endpoint", endpoint).apply()
    }

    /** Forget the account on this phone, including anything not yet sent. */
    fun disconnect(c: Context) {
        prefs(c).edit().clear().apply()
    }

    @Synchronized
    fun enqueue(c: Context, item: JSONObject): Boolean {
        val p = prefs(c)
        // The same notification is often re-posted (updates); keep each once.
        val key = "${item.optString("packageName")}|${item.optString("title")}|${item.optString("text")}"
        val recent = JSONArray(p.getString("recent", "[]"))
        for (i in 0 until recent.length()) if (recent.optString(i) == key) return false
        recent.put(key)
        val trimmedRecent = JSONArray()
        for (i in maxOf(0, recent.length() - RECENT_MAX) until recent.length()) trimmedRecent.put(recent.get(i))

        val queue = JSONArray(p.getString("queue", "[]"))
        queue.put(item)
        val trimmed = JSONArray()
        for (i in maxOf(0, queue.length() - QUEUE_MAX) until queue.length()) trimmed.put(queue.get(i))
        p.edit().putString("queue", trimmed.toString()).putString("recent", trimmedRecent.toString()).apply()
        return true
    }

    @Synchronized
    fun peek(c: Context, max: Int): JSONArray {
        val queue = JSONArray(prefs(c).getString("queue", "[]"))
        val out = JSONArray()
        for (i in 0 until minOf(max, queue.length())) out.put(queue.get(i))
        return out
    }

    @Synchronized
    fun drop(c: Context, count: Int) {
        val queue = JSONArray(prefs(c).getString("queue", "[]"))
        val rest = JSONArray()
        for (i in count until queue.length()) rest.put(queue.get(i))
        prefs(c).edit().putString("queue", rest.toString()).apply()
    }

    fun queued(c: Context): Int = JSONArray(prefs(c).getString("queue", "[]")).length()
}
