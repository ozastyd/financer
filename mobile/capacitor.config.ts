import type { CapacitorConfig } from "@capacitor/cli";

// The app shows the live site (financer.my.id), so every web update reaches
// the app without a new release. Native features (notification reader,
// screenshot scan, share target) live in android/ as Kotlin plugins.
const config: CapacitorConfig = {
  appId: "id.my.financer.app",
  appName: "Financer",
  webDir: "www",
  server: {
    url: "https://financer.my.id",
    androidScheme: "https",
    // Shown when the site can't be reached (no connection).
    errorPath: "offline.html",
  },
  android: {
    // Lets the website tell it is running inside the app.
    appendUserAgent: "FinancerApp/0.1",
    backgroundColor: "#F5F6F2",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#F5F6F2",
      showSpinner: false,
    },
  },
};

export default config;
