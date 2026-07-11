#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-android-project}"
mkdir -p "$ROOT/app/src/main/java/com/yulong/materialpacker" \
  "$ROOT/app/src/main/res/drawable" "$ROOT/app/src/main/res/xml" "$ROOT/app/src/main/res/values" \
  "$ROOT/app/src/main/assets/www/examples"

cat > "$ROOT/settings.gradle" <<'EOF'
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "DouyinMaterialPacker"
include ':app'
EOF

cat > "$ROOT/build.gradle" <<'EOF'
plugins {
    id 'com.android.application' version '8.7.3' apply false
}
EOF

cat > "$ROOT/gradle.properties" <<'EOF'
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
EOF

cat > "$ROOT/app/build.gradle" <<'EOF'
plugins { id 'com.android.application' }
android {
    namespace 'com.yulong.materialpacker'
    compileSdk 35
    defaultConfig {
        applicationId 'com.yulong.materialpacker'
        minSdk 26
        targetSdk 35
        versionCode 31
        versionName '3.1.0'
    }
    buildTypes {
        release { minifyEnabled false }
        debug { applicationIdSuffix '.debug'; versionNameSuffix '-debug' }
    }
}
dependencies { implementation 'androidx.core:core:1.15.0' }
EOF

cat > "$ROOT/app/src/main/AndroidManifest.xml" <<'EOF'
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <application android:allowBackup="true" android:icon="@drawable/ic_launcher"
        android:label="@string/app_name" android:roundIcon="@drawable/ic_launcher"
        android:supportsRtl="true" android:theme="@style/Theme.MaterialPacker"
        android:usesCleartextTraffic="false">
        <activity android:name=".MainActivity" android:configChanges="orientation|screenSize|keyboardHidden"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
        <provider android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider" android:exported="false"
            android:grantUriPermissions="true">
            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths" />
        </provider>
    </application>
</manifest>
EOF

cat > "$ROOT/app/src/main/res/values/strings.xml" <<'EOF'
<resources><string name="app_name">抖音门店资料打包助手</string></resources>
EOF
cat > "$ROOT/app/src/main/res/values/themes.xml" <<'EOF'
<resources>
    <style name="Theme.MaterialPacker" parent="android:style/Theme.Material.Light.NoActionBar">
        <item name="android:fontFamily">sans</item><item name="android:colorAccent">#1677ff</item>
        <item name="android:statusBarColor">#f5f8fc</item><item name="android:navigationBarColor">#ffffff</item>
        <item name="android:windowLightStatusBar">true</item><item name="android:windowLightNavigationBar">true</item>
    </style>
</resources>
EOF
cat > "$ROOT/app/src/main/res/xml/file_paths.xml" <<'EOF'
<paths xmlns:android="http://schemas.android.com/apk/res/android"><cache-path name="camera" path="camera/" /></paths>
EOF
cat > "$ROOT/app/src/main/res/drawable/ic_launcher.xml" <<'EOF'
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#1677FF" android:pathData="M18,8h72a10,10 0,0 1,10 10v72a10,10 0,0 1,-10 10h-72a10,10 0,0 1,-10 -10v-72a10,10 0,0 1,10 -10z"/>
    <path android:fillColor="#FFFFFF" android:pathData="M28,31h52v8h-52zM28,50h52v8h-52zM28,69h34v8h-34zM70,66l6,6 12,-15 6,5 -18,23 -12,-13z"/>
</vector>
EOF

cat > "$ROOT/app/src/main/java/com/yulong/materialpacker/MainActivity.java" <<'EOF'
package com.yulong.materialpacker;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraOutputUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webView.addJavascriptInterface(new DownloadBridge(), "AndroidBridge");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent gallery = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                gallery.addCategory(Intent.CATEGORY_OPENABLE);
                gallery.setType("image/*");
                Intent camera = createCameraIntent();
                Intent chooser = Intent.createChooser(gallery, "拍照或选择图片");
                if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
                return true;
            }
        });
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    private Intent createCameraIntent() {
        try {
            File dir = new File(getCacheDir(), "camera");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File photo = File.createTempFile("material_", ".jpg", dir);
            cameraOutputUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", photo);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            return intent.resolveActivity(getPackageManager()) == null ? null : intent;
        } catch (IOException error) { return null; }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) result = new Uri[]{data.getData()};
            else if (cameraOutputUri != null) result = new Uri[]{cameraOutputUri};
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
        cameraOutputUri = null;
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    private final class DownloadBridge {
        private File tempFile;
        private FileOutputStream output;
        private String fileName;
        private String mimeType;

        @JavascriptInterface
        public synchronized void beginDownload(String requestedName, String requestedMime, int totalBytes) {
            closeQuietly();
            try {
                fileName = sanitizeFileName(requestedName);
                mimeType = requestedMime == null || requestedMime.isEmpty() ? "application/octet-stream" : requestedMime;
                tempFile = new File(getCacheDir(), "download-" + System.currentTimeMillis() + ".tmp");
                output = new FileOutputStream(tempFile);
            } catch (IOException error) { closeQuietly(); throw new IllegalStateException(error); }
        }

        @JavascriptInterface
        public synchronized void appendDownload(String base64Chunk) {
            if (output == null) throw new IllegalStateException("下载尚未开始");
            try { output.write(Base64.decode(base64Chunk, Base64.DEFAULT)); }
            catch (IOException error) { closeQuietly(); throw new IllegalStateException(error); }
        }

        @JavascriptInterface
        public synchronized String finishDownload() {
            try {
                if (output == null || tempFile == null) return "ERROR:下载数据不存在";
                output.flush(); output.close(); output = null;
                String location = saveToDownloads(tempFile, fileName, mimeType);
                if (!tempFile.delete()) tempFile.deleteOnExit();
                tempFile = null;
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "已保存到下载目录：" + fileName, Toast.LENGTH_LONG).show());
                return location;
            } catch (Exception error) { closeQuietly(); return "ERROR:" + error.getMessage(); }
        }

        private String saveToDownloads(File source, String name, String mime) throws IOException {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/抖音门店资料");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IOException("无法创建下载文件");
                try (OutputStream destination = resolver.openOutputStream(uri); FileInputStream input = new FileInputStream(source)) {
                    if (destination == null) throw new IOException("无法写入下载文件");
                    copy(input, destination);
                } catch (Exception error) { resolver.delete(uri, null, null); throw error; }
                values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0); resolver.update(uri, values, null, null);
                return uri.toString();
            }
            File base = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (base == null) base = getFilesDir();
            File folder = new File(base, "抖音门店资料");
            if (!folder.exists() && !folder.mkdirs()) throw new IOException("无法创建下载目录");
            File destinationFile = uniqueFile(folder, name);
            try (FileInputStream input = new FileInputStream(source); FileOutputStream destination = new FileOutputStream(destinationFile)) { copy(input, destination); }
            return destinationFile.getAbsolutePath();
        }

        private void closeQuietly() {
            if (output != null) { try { output.close(); } catch (IOException ignored) {} output = null; }
            if (tempFile != null && tempFile.exists()) tempFile.delete();
            tempFile = null;
        }
    }

    private static void copy(FileInputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[64 * 1024]; int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
    }
    private static String sanitizeFileName(String value) {
        String name = value == null ? "门店资料.zip" : value.trim();
        name = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (name.isEmpty()) name = "门店资料.zip";
        return name.length() > 100 ? name.substring(0, 100) : name;
    }
    private static File uniqueFile(File folder, String name) {
        File initial = new File(folder, name); if (!initial.exists()) return initial;
        int dot = name.lastIndexOf('.'); String base = dot > 0 ? name.substring(0, dot) : name; String ext = dot > 0 ? name.substring(dot) : "";
        for (int index = 2; index < 1000; index++) {
            File candidate = new File(folder, String.format(Locale.ROOT, "%s(%d)%s", base, index, ext));
            if (!candidate.exists()) return candidate;
        }
        return new File(folder, System.currentTimeMillis() + "-" + name);
    }
}
EOF

make_example() {
  local file="$1" title="$2" subtitle="$3" accent="$4"
  cat > "$ROOT/app/src/main/assets/www/examples/$file.svg" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <rect width="720" height="1280" fill="#f5f7fb"/>
  <rect x="52" y="54" width="616" height="1172" rx="40" fill="#ffffff" stroke="#dfe6ef" stroke-width="3"/>
  <rect x="80" y="88" width="560" height="92" rx="22" fill="$accent"/>
  <text x="110" y="142" font-family="sans-serif" font-size="32" font-weight="700" fill="#fff">$title</text>
  <text x="82" y="230" font-family="sans-serif" font-size="27" font-weight="700" fill="#172033">$subtitle</text>
  <rect x="82" y="266" width="556" height="170" rx="24" fill="#f0f5ff"/>
  <circle cx="146" cy="330" r="35" fill="$accent" opacity=".18"/>
  <rect x="204" y="304" width="330" height="22" rx="11" fill="#aab7c8"/>
  <rect x="204" y="346" width="250" height="18" rx="9" fill="#d2d9e3"/>
  <rect x="82" y="470" width="268" height="230" rx="24" fill="#fafbfc" stroke="#e7ebf0"/>
  <rect x="370" y="470" width="268" height="230" rx="24" fill="#fafbfc" stroke="#e7ebf0"/>
  <rect x="108" y="510" width="160" height="18" rx="9" fill="#aab7c8"/>
  <rect x="108" y="554" width="210" height="66" rx="16" fill="$accent" opacity=".12"/>
  <rect x="396" y="510" width="160" height="18" rx="9" fill="#aab7c8"/>
  <rect x="396" y="554" width="210" height="66" rx="16" fill="$accent" opacity=".12"/>
  <rect x="82" y="734" width="556" height="330" rx="24" fill="#ffffff" stroke="#e2e8f0"/>
  <rect x="108" y="778" width="390" height="22" rx="11" fill="#9ba9bc"/>
  <rect x="108" y="832" width="470" height="18" rx="9" fill="#d4dbe5"/>
  <rect x="108" y="878" width="430" height="18" rx="9" fill="#d4dbe5"/>
  <rect x="108" y="924" width="460" height="18" rx="9" fill="#d4dbe5"/>
  <rect x="108" y="984" width="220" height="52" rx="16" fill="$accent"/>
  <text x="218" y="1018" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#fff">示例关键区域</text>
  <text x="360" y="1140" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#7b8797">拍摄时确保店名与关键信息完整清晰</text>
</svg>
EOF
}
make_example platform "入驻平台截图" "展示主体资质与入驻信息" "#1677ff"
make_example homepage "来客店铺首页" "展示店铺名称与经营入口" "#13a56b"
make_example douyin "抖音门店截图" "展示门店主页和商品信息" "#141414"
make_example qr "店铺链接二维码" "二维码完整并可正常识别" "#ed2d55"
make_example orders "后台订单记录" "保留订单、金额和时间" "#1677ff"
make_example overview "经营数据总览" "展示销售额、核销与订单" "#8b5cf6"
make_example settlement "平台结算账户" "展示结算账户和状态" "#f59e0b"
