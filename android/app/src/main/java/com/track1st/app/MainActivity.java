package com.track1st.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
}
