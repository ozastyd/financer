package id.my.financer.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Native features the website can call (see web/src/lib/native.ts).
        registerPlugin(FinancerNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
