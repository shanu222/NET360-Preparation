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
 * Capgo Social Login requires MainActivity to forward Google AuthorizationClient
 * results after the account picker. Without this, online Google Sign-In fails
 * after returning from Google (access-token step never completes).
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
    super.onActivityResult(requestCode, resultCode, data);

    if (requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
        || requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
      return;
    }

    if (getBridge() == null) {
      Log.e(TAG, "Google auth result: Capacitor bridge is null");
      return;
    }

    PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
    if (pluginHandle == null) {
      Log.e(TAG, "Google auth result: SocialLogin plugin handle is null");
      return;
    }

    Plugin plugin = pluginHandle.getInstance();
    if (!(plugin instanceof SocialLoginPlugin)) {
      Log.e(TAG, "Google auth result: plugin instance is not SocialLoginPlugin");
      return;
    }

    ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
  }

  /** Required by Capgo; intentionally empty. */
  @Override
  public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
