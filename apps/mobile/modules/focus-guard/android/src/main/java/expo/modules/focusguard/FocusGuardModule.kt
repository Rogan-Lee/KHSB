package expo.modules.focusguard

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.net.Uri
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

// 안드로이드 집중 모드 — JS(apps/mobile/src/features/student-focus/focus.ts)가 부르는 함수들.
// iOS(스크린 타임)와 같은 모델: 학생이 직접 고른 앱을 직접 켜고 끈다. 상태는 기기 안에만 둔다.
class FocusGuardModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("FocusGuard")

    /** 화면이 그릴 상태를 한 번에 (동기) */
    Function("getState") {
      val store = FocusStore(context)
      val active = FocusGuardService.running && store.timeLeft()
      mapOf(
        "active" to active,
        "endsAt" to (if (store.endsAt > 0) store.endsAt.toDouble() else null),
        "pin" to store.pin,
        "picked" to store.blocked.size,
        "usageAccess" to FocusStore.hasUsageAccess(context),
        "overlay" to FocusStore.canDrawOverlays(context),
        "battery" to FocusStore.ignoresBatteryOptimizations(context)
      )
    }

    /** 홈 화면 아이콘이 있는 앱 목록 — 이 앱·설정·전화 앱은 잠글 수 없게 뺀다(끝내기·권한 끄기·긴급 전화) */
    AsyncFunction("getApps") {
      val pm = context.packageManager
      val excluded = mutableSetOf(context.packageName, "com.android.settings")
      // queryIntentActivities(intent, int) 는 API 33 에서 deprecated(경고만) — minSdk 24 라 그대로 쓴다
      pm.queryIntentActivities(Intent(Intent.ACTION_DIAL), 0).forEach { excluded.add(it.activityInfo.packageName) }
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      val activities = pm.queryIntentActivities(launcher, 0)
      activities
        .distinctBy { it.activityInfo.packageName }
        .filter { it.activityInfo.packageName !in excluded }
        .map {
          mapOf(
            "packageName" to it.activityInfo.packageName,
            "label" to it.loadLabel(pm).toString(),
            "icon" to iconBase64(it.loadIcon(pm))
          )
        }
        .sortedBy { it["label"] as String }
    }

    Function("getBlocked") {
      FocusStore(context).blocked.toList()
    }

    Function("setBlocked") { packages: List<String> ->
      FocusStore(context).blocked = packages.toSet()
    }

    /** 시작(또는 끝 시각만 바꾸기) — 서비스가 돌고 있으면 알림 문구만 새로. 시작이 막히면 false */
    Function("start") { endsAt: Double ->
      FocusStore(context).endsAt = endsAt.toLong()
      FocusGuardService.start(context)
    }

    Function("stop") {
      FocusStore(context).endsAt = 0L
      FocusGuardService.stop(context)
    }

    Function("setPin") { pin: String? ->
      FocusStore(context).pin = pin
    }

    Function("openUsageAccessSettings") {
      context.startActivity(
        Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }

    /** 앱 정보 화면 — 학생이 '배터리'를 눌러 '제한 없음'을 고른다 (배터리 예외를 직접 요청하는 권한은 안 씀) */
    Function("openBatterySettings") {
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }

    Function("openOverlaySettings") {
      context.startActivity(
        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }
  }

  private fun iconBase64(drawable: Drawable): String? {
    return try {
      val size = 96
      val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bitmap)
      drawable.setBounds(0, 0, size, size)
      drawable.draw(canvas)
      val out = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
      Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    } catch (e: Exception) {
      null
    }
  }
}
