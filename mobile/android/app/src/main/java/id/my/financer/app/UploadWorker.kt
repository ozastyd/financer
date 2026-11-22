package id.my.financer.app

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/** Sends queued notifications to Financer when there is a connection; retries with backoff. */
class UploadWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val c = applicationContext
        val token = NotificationStore.token(c) ?: return Result.success()
        val endpoint = NotificationStore.endpoint(c) ?: return Result.success()
        if (!endpoint.startsWith("https://")) return Result.success()
        val found = mutableListOf<NewTransactionsNotifier.Item>()
        repeat(20) {
            val batch = NotificationStore.peek(c, 50)
            if (batch.length() == 0) {
                NewTransactionsNotifier.show(c, found)
                return Result.success()
            }
            val (code, response) = try {
                post(endpoint, token, JSONObject().put("notifications", batch).toString())
            } catch (e: Exception) {
                NewTransactionsNotifier.show(c, found)
                return Result.retry()
            }
            when {
                code in 200..299 -> {
                    NotificationStore.drop(c, batch.length())
                    found += NewTransactionsNotifier.itemsFrom(response)
                }
                code == 401 -> { NotificationStore.disconnect(c); return Result.success() } // device was disconnected
                code == 400 -> NotificationStore.drop(c, batch.length()) // malformed: don't retry forever
                else -> {
                    NewTransactionsNotifier.show(c, found)
                    return Result.retry()
                }
            }
            if (NotificationStore.queued(c) == 0) {
                NewTransactionsNotifier.show(c, found)
                return Result.success()
            }
        }
        NewTransactionsNotifier.show(c, found)
        return Result.success()
    }

    private fun post(endpoint: String, token: String, body: String): Pair<Int, String> {
        val conn = URL(endpoint).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.doOutput = true
            conn.setRequestProperty("content-type", "application/json")
            conn.setRequestProperty("authorization", "Bearer $token")
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val text = if (code in 200..299) conn.inputStream.bufferedReader().use { it.readText() } else ""
            return code to text
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        private const val NAME = "financer-upload"

        fun schedule(c: Context) {
            val req = OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(c).enqueueUniqueWork(NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, req)
        }

        /**
         * Sends right away, replacing an upload that is waiting out its retry
         * delay (after the server was unreachable the delay grows to hours).
         * Called when Financer is opened and its website has loaded, i.e. the
         * server is reachable again. An interrupted send is repeated; the
         * server adds each notification only once.
         */
        fun sendNow(c: Context) {
            val req = OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(c).enqueueUniqueWork(NAME, ExistingWorkPolicy.REPLACE, req)
        }
    }
}
