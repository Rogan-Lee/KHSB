package expo.modules.focusguard

import android.app.AppOpsManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.provider.Settings

// 집중 모드 상태 — 기기 안(SharedPreferences)에만 둔다. 서버로 보내지 않는다.
// ponytail: 잠금 비밀번호는 평문 저장(iOS 앱 그룹 UserDefaults 와 같음) — 앱을 지우거나 권한을 끄면 같이 풀리는 개인용 장치라서.
class FocusStore(context: Context) {
  private val prefs = context.getSharedPreferences("focus_guard", Context.MODE_PRIVATE)

  var blocked: Set<String>
    get() = prefs.getStringSet(KEY_BLOCKED, emptySet())?.toSet() ?: emptySet()
    set(value) = prefs.edit().putStringSet(KEY_BLOCKED, value).apply()

  /** 자동 종료 시각(ms). 0 이면 꺼짐 */
  var endsAt: Long
    get() = prefs.getLong(KEY_ENDS_AT, 0L)
    set(value) = prefs.edit().putLong(KEY_ENDS_AT, value).apply()

  var pin: String?
    get() = prefs.getString(KEY_PIN, null)
    set(value) = prefs.edit().apply { if (value == null) remove(KEY_PIN) else putString(KEY_PIN, value) }.apply()

  /** 끝 시각이 남아 있는지 (서비스가 실제로 도는지는 FocusGuardService.running) */
  fun timeLeft(now: Long = System.currentTimeMillis()) = endsAt > now

  companion object {
    private const val KEY_BLOCKED = "blocked"
    private const val KEY_ENDS_AT = "endsAt"
    private const val KEY_PIN = "pin"

    fun hasUsageAccess(context: Context): Boolean {
      val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      } else {
        @Suppress("DEPRECATION")
        ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      }
      return mode == AppOpsManager.MODE_ALLOWED
    }

    fun canDrawOverlays(context: Context): Boolean = Settings.canDrawOverlays(context)

    /**
     * 설정 › 앱 › 배터리 '제한 없음' — 삼성 등이 배터리를 아끼려고 서비스를 멈추지 않게.
     * 이게 켜져 있으면 시스템이 서비스를 다시 띄울 때(백그라운드) 포그라운드로 올라가는 것도 허용된다.
     */
    fun ignoresBatteryOptimizations(context: Context): Boolean =
      (context.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(context.packageName)
  }
}
