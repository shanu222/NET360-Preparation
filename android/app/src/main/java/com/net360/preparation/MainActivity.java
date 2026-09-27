package com.net360.preparation;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.content.FileProvider;

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
  private static final String WEBVIEW_ASSET_TOKEN = "material-nav-3";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebView webView = this.bridge != null ? this.bridge.getWebView() : null;
    if (webView == null) return;

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
