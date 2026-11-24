package expo.modules.contactpicker

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.provider.ContactsContract
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.Serializable

class PickRequest : Serializable

// The picker grants read access to the one contact it returns, and nothing else. Only that URI is
// queried, and only for the display name, so no contacts permission is needed.
class PickContactContract(private val appContext: AppContext) :
  AppContextActivityResultContract<PickRequest, Result<String?>> {
  override fun createIntent(context: Context, input: PickRequest) =
    Intent(Intent.ACTION_PICK, ContactsContract.Contacts.CONTENT_URI)

  override fun parseResult(input: PickRequest, resultCode: Int, intent: Intent?): Result<String?> =
    runCatching {
      val uri = intent?.data
      val resolver = appContext.reactContext?.contentResolver
      if (resultCode != Activity.RESULT_OK || uri == null || resolver == null) {
        null
      } else {
        resolver.query(uri, arrayOf(ContactsContract.Contacts.DISPLAY_NAME), null, null, null)?.use {
          if (it.moveToFirst()) it.getString(0) else null
        }
      }
    }
}

class ContactPickerModule : Module() {
  private lateinit var launcher: AppContextActivityResultLauncher<PickRequest, Result<String?>>

  @Volatile private var picking = false

  override fun definition() = ModuleDefinition {
    Name("ContactPicker")

    RegisterActivityContracts {
      launcher = registerForActivityResult(PickContactContract(appContext))
    }

    AsyncFunction("pickContact") Coroutine { ->
      if (picking) return@Coroutine null
      picking = true
      try {
        launcher.launch(PickRequest()).getOrThrow()
      } finally {
        picking = false
      }
    }
  }
}
