package com.net360.preparation;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

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

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebView webView = this.bridge != null ? this.bridge.getWebView() : null;
    if (webView == null) return;

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
