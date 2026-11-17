package expo.modules.focusguard

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// 집중 모드 동안만 도는 포그라운드 서비스 (알림이 늘 떠 있음).
// 0.7초마다 지금 화면에 뜬 앱을 사용 정보(UsageStatsManager)로 확인하고, 학생이 고른 앱이면 그 위에 안내 화면을 덮는다.
// 앱을 닫거나 조작하지 않는다 — "홈으로"·"강한선배 열기"는 학생이 누를 때만.
// 끝 시각(최대 3시간)이 지나면 스스로 멈춘다. 서버로는 아무것도 보내지 않는다.
class FocusGuardService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var store: FocusStore
  private var overlay: View? = null
  private var lastTop: String? = null

  private val tick = object : Runnable {
    override fun run() {
      check()
      if (running) handler.postDelayed(this, POLL_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    store = FocusStore(this)
    // 시작 5초 안에 포그라운드로 올라가야 한다 (시스템이 다시 띄운 경우 포함).
    // 배터리 '제한 없음'이 아닌 기기에서 시스템이 백그라운드로 다시 띄우면 막힐 수 있다 → 멈추고, 앱을 열 때 다시 켠다
    running = showNotification()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!running || !store.timeLeft()) {
      finish()
      return START_NOT_STICKY
    }
    showNotification() // 끝 시각이 바뀌었으면(계속 공부) 알림 문구도 새로
    lastTop = foregroundPackage(60_000L)
    handler.removeCallbacks(tick)
    handler.post(tick)
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    handler.removeCallbacks(tick)
    hideOverlay()
    super.onDestroy()
  }

  private fun check() {
    if (!store.timeLeft()) {
      store.endsAt = 0L
      finish()
      return
    }
    foregroundPackage(5_000L)?.let { lastTop = it }
    val top = lastTop
    val blocked = top != null && top != packageName && store.blocked.contains(top)
    if (blocked && FocusStore.canDrawOverlays(this)) showOverlay() else if (!blocked) hideOverlay()
  }

  /** 최근 windowMs 안에 앞으로 나온 마지막 앱 — 그 사이 바뀐 게 없으면 null (직전 값 유지) */
  private fun foregroundPackage(windowMs: Long): String? {
    if (!FocusStore.hasUsageAccess(this)) return null
    val usm = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val now = System.currentTimeMillis()
    val events = usm.queryEvents(now - windowMs, now)
    val e = UsageEvents.Event()
    var last: String? = null
    while (events.hasNextEvent()) {
      events.getNextEvent(e)
      if (e.eventType == EVENT_RESUMED) last = e.packageName
    }
    return last
  }

  private fun finish() {
    running = false
    handler.removeCallbacks(tick)
    hideOverlay()
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  // ── 알림 ─────────────────────────────────────────────────────────────

  /** 포그라운드 알림을 띄운다. 막히면 false */
  private fun showNotification(): Boolean {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "집중 모드", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val endsAt = store.endsAt
    val text = if (endsAt > 0) "${clock(endsAt)}에 저절로 풀려요 · 강한선배 앱에서 끝낼 수 있어요" else "강한선배 앱에서 끝낼 수 있어요"
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
      .setContentTitle("집중 모드 중이에요")
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(openAppIntent())
      .build()
    val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
    return try {
      ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
      true
    } catch (e: Exception) {
      false // 안드로이드 12+ 백그라운드 포그라운드 시작 제한
    }
  }

  private fun openAppIntent(): PendingIntent? {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    return PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun clock(ms: Long) = SimpleDateFormat("a h:mm", Locale.KOREA).format(Date(ms))

  // ── 잠근 앱 위 안내 화면 ─────────────────────────────────────────────────

  private fun showOverlay() {
    if (overlay != null) return
    val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.OPAQUE
    )
    val view = buildOverlay()
    try {
      wm.addView(view, params)
      overlay = view
    } catch (e: Exception) {
      // 권한이 막 꺼진 경우 등 — 다음 확인 때 다시 시도
    }
  }

  private fun hideOverlay() {
    val view = overlay ?: return
    overlay = null
    try {
      (getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(view)
    } catch (e: Exception) {
      // 이미 떼어진 창
    }
  }

  private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

  private fun buildOverlay(): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.WHITE)
      setPadding(dp(32), dp(32), dp(32), dp(32))
      isClickable = true // 아래 앱으로 터치가 가지 않게
    }
    root.addView(TextView(this).apply {
      text = "집중 모드 중이에요"
      setTextColor(Color.parseColor("#1A1C20"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    })
    root.addView(TextView(this).apply {
      val endsAt = store.endsAt
      text = if (endsAt > 0) "이 앱은 ${clock(endsAt)}까지 잠겨 있어요.\n강한선배 앱에서 끝낼 수 있어요." else "강한선배 앱에서 끝낼 수 있어요."
      setTextColor(Color.parseColor("#555D6D"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      gravity = Gravity.CENTER
      setPadding(0, dp(12), 0, dp(32))
    })
    root.addView(button("홈으로", "#FF6600", Color.WHITE) {
      hideOverlay()
      startActivity(
        Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    })
    root.addView(button("강한선배 열기", "#F3F4F5", Color.parseColor("#1A1C20")) {
      hideOverlay()
      packageManager.getLaunchIntentForPackage(packageName)?.let {
        startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52)).apply { topMargin = dp(12) })
    return root
  }

  private fun button(label: String, bg: String, fg: Int, onClick: () -> Unit) = TextView(this).apply {
    text = label
    setTextColor(fg)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
    typeface = Typeface.DEFAULT_BOLD
    gravity = Gravity.CENTER
    background = GradientDrawable().apply {
      setColor(Color.parseColor(bg))
      cornerRadius = dp(14).toFloat()
    }
    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52))
    setOnClickListener { onClick() }
  }

  companion object {
    private const val CHANNEL_ID = "focus_guard"
    private const val NOTIFICATION_ID = 7301
    private const val POLL_MS = 700L
    /** UsageEvents.Event.ACTIVITY_RESUMED(API 29+) = MOVE_TO_FOREGROUND(이전 이름), 값 1 */
    private const val EVENT_RESUMED = 1

    /** 이 프로세스에서 서비스가 돌고 있는지 */
    @Volatile
    var running = false
      private set

    /** 앱이 앞에 있을 때 부른다. 백그라운드라 막히면 false */
    fun start(context: Context): Boolean = try {
      androidx.core.content.ContextCompat.startForegroundService(context, Intent(context, FocusGuardService::class.java))
      true
    } catch (e: Exception) {
      false
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, FocusGuardService::class.java))
    }
  }
}
