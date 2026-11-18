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

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName !in NotificationStore.ALLOWED) return
        if (NotificationStore.token(this) == null) return // not connected to an account
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return // "3 notifikasi baru" summaries
        val extras = n.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
        if (text.isBlank()) return

        val item = JSONObject()
            .put("packageName", sbn.packageName)
            .put("title", title.take(300))
            .put("text", text.take(2000))
            .put("postedAt", iso(sbn.postTime))
        if (NotificationStore.enqueue(this, item)) UploadWorker.schedule(this)
    }

    private fun iso(ms: Long): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(Date(ms))
    }
}
