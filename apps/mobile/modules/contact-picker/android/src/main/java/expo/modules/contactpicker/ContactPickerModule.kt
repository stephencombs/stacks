package expo.modules.contactpicker

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.provider.ContactsContract
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.Serializable
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class PickRequest : Serializable

// The picker grants read access to the one contact it returns, and nothing else, so no contacts
// permission is needed. The grant covers the name column, and often the photo too: that is
// tried, never assumed.
class PickContactContract : AppContextActivityResultContract<PickRequest, Uri?> {
  override fun createIntent(context: Context, input: PickRequest) =
    Intent(Intent.ACTION_PICK, ContactsContract.Contacts.CONTENT_URI)

  override fun parseResult(input: PickRequest, resultCode: Int, intent: Intent?): Uri? =
    if (resultCode == Activity.RESULT_OK) intent?.data else null
}

class ContactPickerModule : Module() {
  private lateinit var launcher: AppContextActivityResultLauncher<PickRequest, Uri?>

  @Volatile private var picking = false

  override fun definition() = ModuleDefinition {
    Name("ContactPicker")

    RegisterActivityContracts {
      launcher = registerForActivityResult(PickContactContract())
    }

    AsyncFunction("pickContact") Coroutine { ->
      if (picking) throw CodedException("ERR_PICK_IN_PROGRESS", "A contact is already being picked.", null)
      picking = true
      try {
        val uri = launcher.launch(PickRequest())
        if (uri == null) null else withContext(Dispatchers.IO) { read(uri) }
      } finally {
        picking = false
      }
    }
  }

  private fun read(uri: Uri): Map<String, Any>? {
    val context = appContext.reactContext ?: return null

    val name =
      context.contentResolver
        .query(uri, arrayOf(ContactsContract.Contacts.DISPLAY_NAME), null, null, null)
        ?.use { if (it.moveToFirst()) it.getString(0) else null }
        ?: return null

    return mapOf("name" to name, "photo" to readPhoto(context, uri))
  }

  // A map with the photo's file URI, "none" when the contact has no photo, or "unavailable" when
  // the Contacts app wouldn't share it: a SecurityException, since the pick's grant often stops
  // short of the photo, or anything else that goes wrong reading it.
  private fun readPhoto(context: Context, uri: Uri): Any =
    try {
      val bytes =
        ContactsContract.Contacts.openContactPhotoInputStream(context.contentResolver, uri, false)
          ?.use { it.readBytes() }

      if (bytes == null) {
        "none"
      } else {
        writeSquare(context, bytes)?.let { mapOf("uri" to Uri.fromFile(it).toString()) }
          ?: "unavailable"
      }
    } catch (e: Exception) {
      "unavailable"
    }

  private fun writeSquare(context: Context, bytes: ByteArray): File? {
    val bounds =
      BitmapFactory.Options().apply { inJustDecodeBounds = true }
        .also { BitmapFactory.decodeByteArray(bytes, 0, bytes.size, it) }

    var sample = 1
    while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= SIDE) sample *= 2

    val decoded =
      BitmapFactory.decodeByteArray(
        bytes,
        0,
        bytes.size,
        BitmapFactory.Options().apply { inSampleSize = sample },
      ) ?: return null

    val upright = upright(decoded, orientation(bytes))
    val shortSide = minOf(upright.width, upright.height)

    val square =
      Bitmap.createBitmap(
        upright,
        (upright.width - shortSide) / 2,
        (upright.height - shortSide) / 2,
        shortSide,
        shortSide,
      )

    val scaled = Bitmap.createScaledBitmap(square, SIDE, SIDE, true)
    val directory = File(context.cacheDir, FOLDER).apply { mkdirs() }
    val file = File(directory, "${UUID.randomUUID()}.jpg")

    FileOutputStream(file).use { scaled.compress(Bitmap.CompressFormat.JPEG, 85, it) }

    return file
  }

  private fun orientation(bytes: ByteArray) =
    runCatching {
        ExifInterface(ByteArrayInputStream(bytes))
          .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
      }
      .getOrDefault(ExifInterface.ORIENTATION_NORMAL)

  private fun upright(bitmap: Bitmap, orientation: Int): Bitmap {
    val matrix = Matrix()

    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> {
        matrix.postRotate(90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_TRANSVERSE -> {
        matrix.postRotate(270f)
        matrix.postScale(-1f, 1f)
      }
      else -> return bitmap
    }

    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
  }

  private companion object {
    const val SIDE = 192
    const val FOLDER = "contact-picks"
  }
}
