package com.track1st.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "InstallAppUpdate")
public class InstallAppUpdatePlugin extends Plugin {
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        String fileName = call.getString("fileName", "track1st.apk");

        if (path == null || path.isEmpty()) {
            call.reject("A file path is required.");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No Android activity is available.");
            return;
        }

        File apkFile = path.startsWith("file://")
            ? new File(Uri.parse(path).getPath())
            : new File(path);
        if (!apkFile.exists()) {
            call.reject("Downloaded APK file does not exist: " + path);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            boolean canInstall = activity.getPackageManager().canRequestPackageInstalls();
            if (!canInstall) {
                Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName()));
                activity.startActivity(settingsIntent);
                call.resolve(new JSObject().put("value", false));
                return;
            }
        }

        Uri contentUri = FileProvider.getUriForFile(
                activity,
                activity.getPackageName() + ".fileprovider",
                apkFile
        );

        // ACTION_VIEW with the APK's content URI is what system installers
        // advertise for this. ACTION_INSTALL_PACKAGE was removed on Android 11+,
        // so it would throw and the update would never start.
        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(contentUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            activity.startActivity(installIntent);
            call.resolve(new JSObject().put("value", true));
        } catch (ActivityNotFoundException e) {
            call.reject("No package installer activity was found to start the update.");
        }
    }
}
