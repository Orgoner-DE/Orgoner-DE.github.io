package de.orgoner.funkhaus;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import java.lang.reflect.Constructor;

/**
 * Vordergrunddienst, solange eine Folge geladen ist: hält die App im Hintergrund am Leben
 * und zeigt eine Medien-Benachrichtigung mit -15 s / Play-Pause / +30 s / Beenden.
 */
public class PlaybackService extends Service {
    private static final String CHANNEL = "playback";
    private static final int NOTIF_ID = 1;
    private static final String ACT_TOGGLE = "de.orgoner.funkhaus.TOGGLE";
    private static final String ACT_BACK = "de.orgoner.funkhaus.BACK";
    private static final String ACT_FWD = "de.orgoner.funkhaus.FWD";
    private static final String ACT_CLOSE = "de.orgoner.funkhaus.CLOSE";

    static PlaybackService inst;
    static boolean playing;
    static String title = "", podcast = "";

    static void update(Context c, boolean pl, String t, String p) {
        playing = pl;
        title = t == null ? "" : t;
        podcast = p == null ? "" : p;
        if (inst != null) {
            inst.refresh();
        } else if (pl) {
            Intent i = new Intent(c, PlaybackService.class);
            try {
                if (Build.VERSION.SDK_INT >= 26) {
                    Context.class.getMethod("startForegroundService", Intent.class).invoke(c, i);
                } else {
                    c.startService(i);
                }
            } catch (Exception ignored) {
                // Start aus dem Hintergrund nicht erlaubt: Wiedergabe läuft trotzdem weiter.
            }
        }
    }

    static void shutdown(Context c) {
        if (inst != null) inst.stopEverything();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        inst = this;
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                Class<?> chCls = Class.forName("android.app.NotificationChannel");
                Object ch = chCls.getConstructor(String.class, CharSequence.class, int.class)
                        .newInstance(CHANNEL, "Wiedergabe", 2 /* IMPORTANCE_LOW */);
                chCls.getMethod("setShowBadge", boolean.class).invoke(ch, false);
                NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                NotificationManager.class.getMethod("createNotificationChannel", chCls).invoke(nm, ch);
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent != null ? intent.getAction() : null;
        MainActivity act = MainActivity.instance;
        if (ACT_TOGGLE.equals(a)) {
            if (act != null) act.runJs("window.__fhToggle && window.__fhToggle()");
        } else if (ACT_BACK.equals(a)) {
            if (act != null) act.runJs("window.__fhSkip && window.__fhSkip(-15)");
        } else if (ACT_FWD.equals(a)) {
            if (act != null) act.runJs("window.__fhSkip && window.__fhSkip(30)");
        } else if (ACT_CLOSE.equals(a)) {
            if (act != null && playing) act.runJs("window.__fhToggle && window.__fhToggle()");
            stopEverything();
            return START_NOT_STICKY;
        }
        if (act == null) {
            stopEverything();
            return START_NOT_STICKY;
        }
        refresh();
        return START_NOT_STICKY;
    }

    void refresh() {
        try {
            startForeground(NOTIF_ID, build());
        } catch (Exception e) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.notify(NOTIF_ID, build());
        }
    }

    void stopEverything() {
        stopForeground(true);
        stopSelf();
        inst = null;
    }

    private PendingIntent svc(String action, int code) {
        Intent i = new Intent(this, PlaybackService.class).setAction(action);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @SuppressWarnings("deprecation")
    private Notification build() {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                Constructor<Notification.Builder> k = Notification.Builder.class.getConstructor(Context.class, String.class);
                b = k.newInstance(this, CHANNEL);
            } catch (Exception e) {
                b = new Notification.Builder(this);
            }
        } else {
            b = new Notification.Builder(this);
            b.setPriority(Notification.PRIORITY_LOW);
        }
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        b.setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(title.isEmpty() ? "Funkhaus" : title)
                .setContentText(podcast)
                .setContentIntent(PendingIntent.getActivity(this, 10, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
                .setOngoing(playing)
                .setShowWhen(false)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .setColor(0xffff9f43)
                .addAction(android.R.drawable.ic_media_rew, "15 s zurück", svc(ACT_BACK, 11))
                .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        playing ? "Pause" : "Abspielen", svc(ACT_TOGGLE, 12))
                .addAction(android.R.drawable.ic_media_ff, "30 s vor", svc(ACT_FWD, 13))
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Beenden", svc(ACT_CLOSE, 15))
                .setStyle(new Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2));
        if (!playing) b.setDeleteIntent(svc(ACT_CLOSE, 14));
        return b.build();
    }

    @Override
    public void onDestroy() {
        if (inst == this) inst = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
