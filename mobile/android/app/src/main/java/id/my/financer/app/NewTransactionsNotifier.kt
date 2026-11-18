package id.my.financer.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

/** Financer's own notification: "1 transaksi perlu dicek · GoPay −Rp5.000". Tapping opens Perlu dicek. */
object NewTransactionsNotifier {
    data class Item(val source: String, val type: String, val amount: Long)

    private const val CHANNEL = "detected_transactions"
    private const val ID = 4201

    private val NAMES = mapOf(
        "mybca" to "myBCA", "livin" to "Livin'", "brimo" to "BRImo", "dana" to "DANA",
        "shopeepay" to "ShopeePay", "gopay" to "GoPay", "ovo" to "OVO",
    )

    fun itemsFrom(response: String): List<Item> = try {
        val arr = JSONObject(response).optJSONArray("items") ?: return emptyList()
        (0 until arr.length()).map {
            val o = arr.getJSONObject(it)
            Item(o.optString("source"), o.optString("type"), o.optLong("amount"))
        }
    } catch (e: Exception) {
        emptyList()
    }

    private fun rupiah(n: Long): String = "Rp" + NumberFormat.getIntegerInstance(Locale("id", "ID")).format(n)

    fun show(c: Context, items: List<Item>) {
        if (items.isEmpty()) return
        val nm = NotificationManagerCompat.from(c)
        if (!nm.areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(CHANNEL, "Transaksi terdeteksi", NotificationManager.IMPORTANCE_DEFAULT)
            ch.description = "Saat Financer membaca transaksi baru dari notifikasi bank atau e-wallet"
            (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
        }
        val line = { i: Item -> "${NAMES[i.source] ?: i.source} · ${if (i.type == "income") "+" else "−"}${rupiah(i.amount)}" }
        val title = if (items.size == 1) "1 transaksi perlu dicek" else "${items.size} transaksi perlu dicek"
        val text = if (items.size == 1) "${line(items[0])}. Ketuk untuk cek." else items.take(3).joinToString(", ") { line(it) } + if (items.size > 3) ", …" else ""

        val open = Intent(c, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("financer_open", "/perlu-dicek")
        val pending = PendingIntent.getActivity(c, ID, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val n = NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_financer)
            .setColor(0xFF047857.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .build()
        try {
            nm.notify(ID, n)
        } catch (e: SecurityException) {
            // notification permission was revoked in the meantime
        }
    }
}
