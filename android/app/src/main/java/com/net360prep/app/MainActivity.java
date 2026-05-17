package com.net360prep.app;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
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
  public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
    // Marker method required by @capgo/capacitor-social-login for advanced Google auth flows.
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);

    // Forward Google authorization intent results to the SocialLogin plugin when required.
    if (requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
      || requestCode > GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
      return;
    }

    if (bridge == null) return;
    PluginHandle pluginHandle = bridge.getPlugin("SocialLogin");
    if (pluginHandle == null) return;
    if (!(pluginHandle.getInstance() instanceof SocialLoginPlugin)) return;
    SocialLoginPlugin socialLoginPlugin = (SocialLoginPlugin) pluginHandle.getInstance();
    socialLoginPlugin.handleGoogleLoginIntent(requestCode, data);
  }
}
