package id.my.financer.app

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/** Lets financer.my.id (inside the app) connect this phone and check notification access. */
@CapacitorPlugin(
    name = "FinancerNative",
    permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])],
)
class FinancerNativePlugin : Plugin() {

    private fun listenerEnabled(): Boolean =
        NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)

    @PluginMethod
    fun status(call: PluginCall) {
        val ret = JSObject()
        ret.put("listenerEnabled", listenerEnabled())
        ret.put("connected", NotificationStore.token(context) != null)
        ret.put("deviceId", NotificationStore.deviceId(context))
        ret.put("queued", NotificationStore.queued(context))
        ret.put("notificationsEnabled", NotificationManagerCompat.from(context).areNotificationsEnabled())
        call.resolve(ret)
    }

    /** Android 13+: ask to show Financer's own "transaksi perlu dicek" notifications. */
    @PluginMethod
    fun requestNotifications(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            notificationsResult(call)
        } else {
            requestPermissionForAlias("notifications", call, "notificationsResult")
        }
    }

    @PermissionCallback
    private fun notificationsResult(call: PluginCall) {
        val ret = JSObject()
        ret.put("granted", NotificationManagerCompat.from(context).areNotificationsEnabled())
        call.resolve(ret)
    }

    @PluginMethod
    fun openListenerSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        val token = call.getString("token")
        val deviceId = call.getString("deviceId")
        val endpoint = call.getString("endpoint")
        if (token.isNullOrBlank() || deviceId.isNullOrBlank() || endpoint == null || !endpoint.startsWith("https://")) {
            call.reject("invalid connection details")
            return
        }
        NotificationStore.connect(context, token, deviceId, endpoint)
        call.resolve()
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        NotificationStore.disconnect(context)
        call.resolve()
    }

    @PluginMethod
    fun flush(call: PluginCall) {
        val queued = NotificationStore.queued(context)
        UploadWorker.schedule(context)
        val ret = JSObject()
        ret.put("sent", queued)
        call.resolve(ret)
    }
}
