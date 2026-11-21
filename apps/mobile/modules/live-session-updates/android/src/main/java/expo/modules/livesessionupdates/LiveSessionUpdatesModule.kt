package expo.modules.livesessionupdates

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class LivePayload : Record {
  @Field var gameLabel: String = ""
  @Field var venueLabel: String = ""
  @Field var buyInText: String = ""
  @Field var startedAtMs: Double = 0.0
  @Field var privacyMode: Boolean = false
  @Field var openUrl: String = ""
  @Field var rebuy100Url: String = ""
  @Field var rebuy200Url: String = ""
  @Field var cashOutUrl: String = ""
}

class FinishedPayload : Record {
  @Field var gameLabel: String = ""
  @Field var finishedTimeText: String = ""
  @Field var resultText: String = ""
  @Field var durationText: String = ""
  @Field var summaryLine: String = ""
  @Field var finishedAtMs: Double = 0.0
  @Field var privacyMode: Boolean = false
  @Field var seeSessionUrl: String = ""
  @Field var backAtTableUrl: String = ""
}

class LiveSessionUpdatesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiveSessionUpdates")

    AsyncFunction("getStatus") {
      val context = appContext.reactContext
        ?: return@AsyncFunction mapOf(
          "supported" to false,
          "notificationsEnabled" to false,
          "canPostPromoted" to false,
          "apiLevel" to Build.VERSION.SDK_INT,
        )
      val manager = context.getSystemService(NotificationManager::class.java)
      val enabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
      val promoted =
        if (Build.VERSION.SDK_INT >= 36 && manager != null) {
          manager.canPostPromotedNotifications()
        } else {
          false
        }
      mapOf(
        "supported" to true,
        "notificationsEnabled" to enabled,
        "canPostPromoted" to promoted,
        "apiLevel" to Build.VERSION.SDK_INT,
      )
    }

    AsyncFunction("showLive") { payload: LivePayload ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      val manager = context.getSystemService(NotificationManager::class.java) ?: return@AsyncFunction null
      ensureChannels(manager)
      val compat = NotificationManagerCompat.from(context)
      if (!compat.areNotificationsEnabled()) return@AsyncFunction null
      manager.cancel(FINISHED_NOTIFICATION_ID)

      val builder = NotificationCompat.Builder(context, LIVE_CHANNEL_ID)
        .setSmallIcon(resolveSmallIcon(context))
        .setContentTitle("${payload.gameLabel} · ${payload.buyInText}")
        .setContentText(payload.venueLabel)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(true)
        .setWhen(payload.startedAtMs.toLong())
        .setUsesChronometer(true)
        .setColor(FELT_ACCENT)
        .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        .setVisibility(
          if (payload.privacyMode) {
            NotificationCompat.VISIBILITY_PRIVATE
          } else {
            NotificationCompat.VISIBILITY_PUBLIC
          },
        )
        .setRequestPromotedOngoing(true)
        .setContentIntent(activityIntent(context, REQ_OPEN, payload.openUrl))
        .addAction(0, "+ $100", activityIntent(context, REQ_REBUY_100, payload.rebuy100Url))
        .addAction(0, "+ $200", activityIntent(context, REQ_REBUY_200, payload.rebuy200Url))
        .addAction(0, "Cash out", activityIntent(context, REQ_CASH_OUT, payload.cashOutUrl))

      try {
        compat.notify(LIVE_NOTIFICATION_ID, builder.build())
      } catch (_: SecurityException) {
        // Permission was revoked between check and notify; fail quietly.
      }
      null
    }

    AsyncFunction("showFinished") { payload: FinishedPayload ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      val manager = context.getSystemService(NotificationManager::class.java) ?: return@AsyncFunction null
      ensureChannels(manager)
      val compat = NotificationManagerCompat.from(context)
      manager.cancel(LIVE_NOTIFICATION_ID)
      if (!compat.areNotificationsEnabled()) return@AsyncFunction null

      val body = "${payload.durationText} · ${payload.finishedTimeText}\n${payload.summaryLine}"
      val builder = NotificationCompat.Builder(context, FINISHED_CHANNEL_ID)
        .setSmallIcon(resolveSmallIcon(context))
        .setContentTitle("${payload.gameLabel} · ${payload.resultText}")
        .setContentText("${payload.durationText} · ${payload.finishedTimeText}")
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setOngoing(false)
        .setAutoCancel(true)
        .setShowWhen(true)
        .setWhen(payload.finishedAtMs.toLong())
        .setColor(FELT_ACCENT)
        .setVisibility(
          if (payload.privacyMode) {
            NotificationCompat.VISIBILITY_PRIVATE
          } else {
            NotificationCompat.VISIBILITY_PUBLIC
          },
        )
        .setContentIntent(activityIntent(context, REQ_SEE_SESSION, payload.seeSessionUrl))
        .addAction(0, "See session", activityIntent(context, REQ_SEE_SESSION, payload.seeSessionUrl))
        .addAction(
          0,
          "Back at the table",
          activityIntent(context, REQ_BACK_AT_TABLE, payload.backAtTableUrl),
        )

      try {
        compat.notify(FINISHED_NOTIFICATION_ID, builder.build())
      } catch (_: SecurityException) {
        // Permission was revoked; skip cleanly.
      }
      null
    }

    AsyncFunction("clear") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      val manager = context.getSystemService(NotificationManager::class.java) ?: return@AsyncFunction null
      manager.cancel(LIVE_NOTIFICATION_ID)
      manager.cancel(FINISHED_NOTIFICATION_ID)
      null
    }
  }

  private fun ensureChannels(manager: NotificationManager) {
    if (manager.getNotificationChannel(LIVE_CHANNEL_ID) == null) {
      val channel = NotificationChannel(
        LIVE_CHANNEL_ID,
        "Live sessions",
        NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        description = "Shows your active casino session as a Live Update."
        setSound(null, null)
        enableVibration(false)
      }
      manager.createNotificationChannel(channel)
    }
    if (manager.getNotificationChannel(FINISHED_CHANNEL_ID) == null) {
      val channel = NotificationChannel(
        FINISHED_CHANNEL_ID,
        "Finished sessions",
        NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        description = "Summary when you cash out a live session."
        setSound(null, null)
        enableVibration(false)
      }
      manager.createNotificationChannel(channel)
    }
  }

  private fun resolveSmallIcon(context: Context): Int {
    val resId = context.resources.getIdentifier("ic_stat_color_up", "drawable", context.packageName)
    return if (resId != 0) resId else context.applicationInfo.icon
  }

  private fun activityIntent(context: Context, requestCode: Int, url: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getActivity(context, requestCode, intent, flags)
  }

  companion object {
    private const val LIVE_CHANNEL_ID = "live_session"
    private const val FINISHED_CHANNEL_ID = "finished_session"
    private const val LIVE_NOTIFICATION_ID = 4101
    private const val FINISHED_NOTIFICATION_ID = 4102
    private const val FELT_ACCENT = 0xFF14532D.toInt()
    private const val REQ_OPEN = 410
    private const val REQ_REBUY_100 = 411
    private const val REQ_REBUY_200 = 412
    private const val REQ_CASH_OUT = 413
    private const val REQ_SEE_SESSION = 420
    private const val REQ_BACK_AT_TABLE = 421
  }
}
