package com.track1st.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(Bundle savedInstanceState) {
		registerPlugin(InstallAppUpdatePlugin.class);
		super.onCreate(savedInstanceState);
	}
}
