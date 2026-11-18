package id.my.financer.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Native features the website can call (see web/src/lib/native.ts).
        registerPlugin(FinancerNativePlugin.class);
        super.onCreate(savedInstanceState);
        openFrom(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openFrom(intent);
    }

    /** A tap on Financer's notification opens the page it names (e.g. /perlu-dicek). */
    private void openFrom(Intent intent) {
        if (intent == null) return;
        String path = intent.getStringExtra("financer_open");
        if (path == null || !path.startsWith("/") || path.startsWith("//")) return;
        intent.removeExtra("financer_open");
        String origin = NotificationStore.origin(this);
        if (origin == null || getBridge() == null) return;
        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(origin + path));
    }
}
