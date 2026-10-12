package com.track1st.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

// The plugin rejects any Google login that passes explicit scopes unless the
// activity implements this marker interface, because it needs the activity
// result to complete the scope grant. The body is intentionally empty: the
// interface exists purely so the plugin can detect the modification.
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
	@Override
	public void onCreate(Bundle savedInstanceState) {
		registerPlugin(InstallAppUpdatePlugin.class);
		super.onCreate(savedInstanceState);

		// Hide the WebView's native scrollbars and disable the overscroll
		// glow/bounce at the edges while keeping scrolling fully enabled.
		WebView webView = getBridge() != null ? getBridge().getWebView() : null;
		if (webView != null) {
			webView.setVerticalScrollBarEnabled(false);
			webView.setHorizontalScrollBarEnabled(false);
			webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
		}
	}

	@Override
	public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}