package io.github.kevinstadelmann.keep;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Shows the bundled Keep web app. The files ship inside the APK and are served to the
 * WebView from a fixed https origin, so the app needs no network and its localStorage
 * data stays in the same place across updates.
 */
public class MainActivity extends Activity {
    /** Sent by the app shortcut and the widget's button: open straight on the "Add a skip" sheet. */
    static final String ACTION_ADD = "io.github.kevinstadelmann.keep.ADD_SKIP";

    private static final String HOST = WebViewAssetLoader.DEFAULT_DOMAIN;
    private static final String START_URL = "https://" + HOST + "/index.html";
    private static final int REQUEST_PICK_BACKUP = 1;
    private static final int REQUEST_SAVE_BACKUP = 2;
    private static final String STATE_PENDING_BACKUP = "pendingBackup";
    private static final int PAPER_LIGHT = 0xFFF8F8F2;
    private static final int PAPER_DARK = 0xFF121A16;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingBackup;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) {
            pendingBackup = savedInstanceState.getString(STATE_PENDING_BACKUP);
        }

        final WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        webView.addJavascriptInterface(new Bridge(), "KeepAndroid");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (HOST.equals(url.getHost()) && ("/".equals(url.getPath()) || url.getPath() == null)) {
                    url = Uri.parse(START_URL);
                }
                return assets.shouldInterceptRequest(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Only the bundled app may load inside this WebView.
                return !HOST.equals(request.getUrl().getHost());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("*/*");
                try {
                    startActivityForResult(pick, REQUEST_PICK_BACKUP);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });

        boolean openAdd = savedInstanceState == null && ACTION_ADD.equals(getIntent().getAction());
        webView.loadUrl(openAdd ? START_URL + "?action=add" : START_URL);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (ACTION_ADD.equals(intent.getAction()) && webView != null) {
            webView.evaluateJavascript("window.keepAdd && keepAdd()", null);
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // The phone may have switched between light and dark.
        if (webView != null) {
            webView.evaluateJavascript("window.applyTheme && applyTheme()", null);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(STATE_PENDING_BACKUP, pendingBackup);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_PICK_BACKUP) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
        } else if (requestCode == REQUEST_SAVE_BACKUP) {
            String json = pendingBackup;
            pendingBackup = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || json == null) {
                return;
            }
            boolean saved = false;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                if (out != null) {
                    out.write(json.getBytes(StandardCharsets.UTF_8));
                    saved = true;
                }
            } catch (Exception e) {
                saved = false;
            }
            Toast.makeText(this, saved ? R.string.backup_saved : R.string.backup_failed,
                    Toast.LENGTH_LONG).show();
        }
    }

    /** Colours the system bars and the area behind the page to match the app's light or dark theme. */
    @SuppressWarnings("deprecation")
    private void applyBars(boolean dark) {
        int color = dark ? PAPER_DARK : PAPER_LIGHT;
        Window window = getWindow();
        window.setStatusBarColor(color);
        window.setNavigationBarColor(color);
        View decor = window.getDecorView();
        int flags = decor.getSystemUiVisibility();
        int light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            light |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        decor.setSystemUiVisibility(dark ? flags & ~light : flags | light);
        decor.setBackgroundColor(color);
        webView.setBackgroundColor(color);
    }

    /** Methods the web app calls as window.KeepAndroid. */
    private final class Bridge {
        /** A WebView cannot download the blob link the browser version uses for backups. */
        @JavascriptInterface
        public void saveBackup(final String fileName, final String json) {
            runOnUiThread(() -> {
                pendingBackup = json;
                Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("application/json")
                        .putExtra(Intent.EXTRA_TITLE, fileName);
                try {
                    startActivityForResult(create, REQUEST_SAVE_BACKUP);
                } catch (ActivityNotFoundException e) {
                    pendingBackup = null;
                    Toast.makeText(MainActivity.this, R.string.backup_failed, Toast.LENGTH_LONG).show();
                }
            });
        }

        /** The WebView does not tell the page whether the phone is in dark mode, so the page asks. */
        @JavascriptInterface
        public boolean isSystemDark() {
            int night = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
            return night == Configuration.UI_MODE_NIGHT_YES;
        }

        @JavascriptInterface
        public void setDark(final boolean dark) {
            runOnUiThread(() -> applyBars(dark));
        }

        /** Keeps the home-screen widget showing the selected goal. */
        @JavascriptInterface
        public void updateWidget(String goalName, String progress, int percent) {
            Context context = getApplicationContext();
            context.getSharedPreferences(KeepWidget.PREFS, Context.MODE_PRIVATE).edit()
                    .putString(KeepWidget.KEY_GOAL, goalName)
                    .putString(KeepWidget.KEY_PROGRESS, progress)
                    .putInt(KeepWidget.KEY_PERCENT, Math.max(0, Math.min(100, percent)))
                    .apply();
            KeepWidget.refreshAll(context);
        }
    }
}
