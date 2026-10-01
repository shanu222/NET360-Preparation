package com.net360.preparation;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.graphics.Outline;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;
import androidx.core.splashscreen.SplashScreen;

import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

import android.content.IntentSender;

import java.io.File;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

/**
 * Capgo Social Login: implement ModifiedMainActivityForSocialLoginPlugin and forward
 * Google AuthorizationClient results when needed. NET360 Firebase login prefers ID-token-only
 * resolution (patched Capgo), but this forwarding remains for offline/consent paths.
 */
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
  private static final String TAG = "NET360MainActivity";
  private static final String WEBVIEW_ASSET_TOKEN = "startup-boot-1";
  private static final int REQ_IMMEDIATE_UPDATE = 48136;
  private static volatile boolean startupReady = false;
  private AppUpdateManager appUpdateManager;
  private View mandatoryUpdateOverlay;
  private boolean mandatoryUpdateRequired;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    SharedPreferences startup = getSharedPreferences("net360_startup", MODE_PRIVATE);
    boolean light = "light".equals(startup.getString("theme", "dark"));
    setTheme(light ? R.style.AppTheme_NoActionBarLaunch_Light : R.style.AppTheme_NoActionBarLaunch);
    SplashScreen.installSplashScreen(this).setKeepOnScreenCondition(() -> !startupReady);
    super.onCreate(savedInstanceState);

    WebView webView = this.bridge != null ? this.bridge.getWebView() : null;
    if (webView == null) return;

    webView.setBackgroundColor(light ? 0xFFF3F5FB : 0xFF0C1222);
    refreshWebViewAssetsIfNeeded(webView);

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setSafeBrowsingEnabled(true);

    CookieManager cookieManager = CookieManager.getInstance();
    cookieManager.setAcceptCookie(true);
    cookieManager.setAcceptThirdPartyCookies(webView, true);
    CookieManager.getInstance().flush();

    webView.setVerticalScrollBarEnabled(false);
    webView.setHorizontalScrollBarEnabled(false);
    webView.setScrollbarFadingEnabled(true);
    webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
    webView.setNestedScrollingEnabled(true);
    webView.setSaveEnabled(true);
    webView.addJavascriptInterface(new PdfBridge(), "NET360NativeFiles");
    webView.addJavascriptInterface(new StartupBridge(), "NET360Startup");
    webView.addJavascriptInterface(new UpdateBridge(), "NET360Update");
    appUpdateManager = AppUpdateManagerFactory.create(this);
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        if (mandatoryUpdateRequired) return;
        setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        setEnabled(true);
      }
    });
  }

  /**
   * WebView can keep the previous localhost bundle after an update. Drop that cache once per asset token.
   */
  private void refreshWebViewAssetsIfNeeded(WebView webView) {
    try {
      SharedPreferences prefs = getSharedPreferences("net360_webview", MODE_PRIVATE);
      if (WEBVIEW_ASSET_TOKEN.equals(prefs.getString("asset_token", ""))) return;
      webView.clearCache(true);
      prefs.edit().putString("asset_token", WEBVIEW_ASSET_TOKEN).apply();
      webView.reload();
    } catch (Exception error) {
      Log.w(TAG, "WebView asset refresh skipped", error);
    }
  }

  /**
   * Opens or shares a PDF already written into the app cache via the system viewer/share sheet.
   * WebView cannot reliably open application/pdf from a capacitor file URL.
   */
  private void presentPdf(String rawPath, boolean share) {
    try {
      String path = String.valueOf(rawPath == null ? "" : rawPath).trim();
      if (path.startsWith("file://")) {
        String parsed = Uri.parse(path).getPath();
        if (parsed != null) path = parsed;
      }
      File file = new File(path);
      if (!file.isFile() || file.length() < 5 || !file.getName().toLowerCase().endsWith(".pdf")) {
        Log.e(TAG, "PDF intent skipped: missing or invalid file");
        return;
      }
      Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
      Intent view = new Intent(Intent.ACTION_VIEW);
      view.setDataAndType(uri, "application/pdf");
      view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      Intent send = new Intent(Intent.ACTION_SEND);
      send.setType("application/pdf");
      send.putExtra(Intent.EXTRA_STREAM, uri);
      send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      Intent chooser = Intent.createChooser(share ? send : view, share ? "Share PDF" : "Open PDF");
      if (share) {
        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { view });
      } else {
        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { send });
      }
      startActivity(chooser);
    } catch (Exception error) {
      Log.e(TAG, "PDF intent failed", error);
    }
  }

  private final class PdfBridge {
    @JavascriptInterface
    public void openOrShare(String absolutePath, boolean share) {
      runOnUiThread(() -> presentPdf(absolutePath, share));
    }
  }

  private final class StartupBridge {
    @JavascriptInterface
    public void setTheme(String mode) {
      getSharedPreferences("net360_startup", MODE_PRIVATE)
          .edit()
          .putString("theme", "light".equals(mode) ? "light" : "dark")
          .apply();
    }

    @JavascriptInterface
    public void markReady() {
      startupReady = true;
    }
  }

  private final class UpdateBridge {
    @JavascriptInterface
    public void requireUpdate() {
      runOnUiThread(() -> showMandatoryUpdate());
    }
  }

  private void showMandatoryUpdate() {
    mandatoryUpdateRequired = true;
    if (mandatoryUpdateOverlay != null) {
      mandatoryUpdateOverlay.bringToFront();
      return;
    }
    ViewGroup content = findViewById(android.R.id.content);
    if (content == null) return;
    boolean light = "light".equals(getSharedPreferences("net360_startup", MODE_PRIVATE).getString("theme", "dark"));
    View overlay = getLayoutInflater().inflate(R.layout.net360_update_required, content, false);
    overlay.setBackgroundColor(light ? 0xFFF3F5FB : 0xFF0C1222);
    LinearLayout card = overlay.findViewById(R.id.net360_update_card);
    TextView title = overlay.findViewById(R.id.net360_update_title);
    TextView message = overlay.findViewById(R.id.net360_update_message);
    if (!light && card != null) {
      card.setBackgroundResource(R.drawable.net360_update_card_dark);
      if (title != null) title.setTextColor(0xFFF8FAFC);
      if (message != null) message.setTextColor(0xFFCBD5E1);
    }
    ImageView logo = overlay.findViewById(R.id.net360_update_logo);
    if (logo != null) {
      logo.setOutlineProvider(new ViewOutlineProvider() {
        @Override
        public void getOutline(View view, Outline outline) {
          outline.setOval(0, 0, view.getWidth(), view.getHeight());
        }
      });
      logo.setClipToOutline(true);
      logo.post(logo::invalidateOutline);
    }
    Button updateNow = overlay.findViewById(R.id.net360_update_now);
    if (updateNow != null) updateNow.setOnClickListener(view -> startPlayUpdate());
    content.addView(overlay);
    overlay.bringToFront();
    mandatoryUpdateOverlay = overlay;
  }

  private void startPlayUpdate() {
    if (appUpdateManager == null) {
      openPlayListing();
      return;
    }
    appUpdateManager.getAppUpdateInfo()
        .addOnSuccessListener(info -> {
          boolean inProgress = info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS;
          boolean available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE || inProgress;
          if (!available || !info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
            openPlayListing();
            return;
          }
          try {
            appUpdateManager.startUpdateFlowForResult(
                info,
                this,
                AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build(),
                REQ_IMMEDIATE_UPDATE);
          } catch (IntentSender.SendIntentException error) {
            Log.e(TAG, "Play update flow failed", error);
            openPlayListing();
          }
        })
        .addOnFailureListener(error -> {
          Log.e(TAG, "Play update info failed", error);
          openPlayListing();
        });
  }

  private void openPlayListing() {
    String packageName = getPackageName();
    try {
      Intent market = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + packageName));
      market.setPackage("com.android.vending");
      startActivity(market);
    } catch (Exception error) {
      try {
        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + packageName)));
      } catch (Exception nested) {
        Log.e(TAG, "Play listing failed", nested);
      }
    }
  }

  @Override
  public void onPause() {
    WebView webView = this.bridge != null ? this.bridge.getWebView() : null;
    if (webView != null) {
      webView.onPause();
    }
    super.onPause();
  }

  @Override
  public void onResume() {
    super.onResume();
    WebView webView = this.bridge != null ? this.bridge.getWebView() : null;
    if (webView != null) {
      webView.onResume();
    }
    if (mandatoryUpdateRequired && appUpdateManager != null) {
      appUpdateManager.getAppUpdateInfo().addOnSuccessListener(info -> {
        if (info.updateAvailability() != UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) return;
        if (!info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) return;
        try {
          appUpdateManager.startUpdateFlowForResult(
              info,
              this,
              AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build(),
              REQ_IMMEDIATE_UPDATE);
        } catch (IntentSender.SendIntentException error) {
          Log.e(TAG, "Resume Play update failed", error);
        }
      });
    }
  }

  @Override
  public void onSaveInstanceState(Bundle outState) {
    super.onSaveInstanceState(outState);
    WebView webView = this.bridge != null ? this.bridge.getWebView() : null;
    if (webView != null) {
      webView.saveState(outState);
    }
  }

  @Override
  public void onActivityResult(int requestCode, int resultCode, Intent data) {
    if (requestCode == REQ_IMMEDIATE_UPDATE) {
      if (resultCode != RESULT_OK) showMandatoryUpdate();
      return;
    }
    /* Handle Capgo Google authorization before Capacitor Bridge consumes the result. */
    if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
        && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
      if (getBridge() == null) {
        Log.e(TAG, "Google auth result: Capacitor bridge is null");
      } else {
        PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
        if (pluginHandle == null) {
          Log.e(TAG, "Google auth result: SocialLogin plugin handle is null");
        } else {
          Plugin plugin = pluginHandle.getInstance();
          if (plugin instanceof SocialLoginPlugin) {
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
          } else {
            Log.e(TAG, "Google auth result: plugin instance is not SocialLoginPlugin");
          }
        }
      }
      return;
    }

    super.onActivityResult(requestCode, resultCode, data);
  }

  /** Required by Capgo; intentionally empty. */
  @Override
  public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
