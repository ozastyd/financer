package id.my.financer.app

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Runs once the user grants Financer "notification access". Looks only at
 * notifications from the allow-listed bank and e-wallet apps; every other
 * notification is ignored right here and never stored or sent.
 */
class BankNotificationListener : NotificationListenerService() {

    override fun onListenerConnected() {
        instance = this
        if (sweep() > 0) UploadWorker.schedule(this)
    }

    override fun onListenerDisconnected() {
        if (instance === this) instance = null
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val item = itemFrom(sbn) ?: return
        if (NotificationStore.enqueue(this, item)) UploadWorker.schedule(this)
    }

    /**
     * Picks up bank notifications still in the notification shade that were
     * missed (Financer's listener was stopped, or the phone was restarted).
     * Already-sent ones are skipped here and again by the server's fingerprint.
     * Android doesn't let apps read notifications the user has dismissed.
     */
    fun sweep(): Int {
        if (NotificationStore.token(this) == null) return 0
        val active = try { activeNotifications } catch (e: Exception) { null } ?: return 0
        // Nothing from before this phone was connected, and nothing older than three days.
        val since = maxOf(NotificationStore.connectedAt(this), System.currentTimeMillis() - SWEEP_WINDOW_MS)
        var added = 0
        for (sbn in active) {
            if (sbn.postTime < since) continue
            val item = itemFrom(sbn) ?: continue
            if (NotificationStore.enqueue(this, item)) added++
        }
        return added
    }

    private fun itemFrom(sbn: StatusBarNotification): JSONObject? {
        if (sbn.packageName !in NotificationStore.ALLOWED) return null
        if (NotificationStore.token(this) == null) return null // not connected to an account
        val n = sbn.notification ?: return null
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return null // "3 notifikasi baru" summaries
        val extras = n.extras ?: return null
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
        if (text.isBlank()) return null
        return JSONObject()
            .put("packageName", sbn.packageName)
            .put("title", title.take(300))
            .put("text", text.take(2000))
            .put("postedAt", iso(sbn.postTime))
    }

    private fun iso(ms: Long): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(Date(ms))
    }

    companion object {
        private const val SWEEP_WINDOW_MS = 3L * 24 * 60 * 60 * 1000

        /** The running listener, while Android has it connected. */
        @Volatile
        var instance: BankNotificationListener? = null
            private set
    }
}
