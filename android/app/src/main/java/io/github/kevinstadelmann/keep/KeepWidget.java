package io.github.kevinstadelmann.keep;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * Home-screen widget: the selected goal with its progress and an "Add a skip" button.
 * The app's data lives inside the WebView, so the app hands the widget a small copy
 * (goal name, progress text, percent) through shared preferences whenever it changes.
 */
public class KeepWidget extends AppWidgetProvider {
    static final String PREFS = "widget";
    static final String KEY_GOAL = "goal";
    static final String KEY_PROGRESS = "progress";
    static final String KEY_PERCENT = "percent";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        RemoteViews views = build(context);
        for (int id : ids) {
            manager.updateAppWidget(id, views);
        }
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, KeepWidget.class));
        if (ids.length > 0) {
            manager.updateAppWidget(ids, build(context));
        }
    }

    private static RemoteViews build(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_keep);
        views.setTextViewText(R.id.widget_goal, prefs.getString(KEY_GOAL, context.getString(R.string.app_name)));
        views.setTextViewText(R.id.widget_progress,
                prefs.getString(KEY_PROGRESS, context.getString(R.string.widget_open_hint)));
        views.setProgressBar(R.id.widget_bar, 100, prefs.getInt(KEY_PERCENT, 0), false);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        Intent open = new Intent(context, MainActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 0, open, flags));

        Intent add = new Intent(context, MainActivity.class)
                .setAction(MainActivity.ACTION_ADD)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        views.setOnClickPendingIntent(R.id.widget_add, PendingIntent.getActivity(context, 1, add, flags));
        return views;
    }
}
