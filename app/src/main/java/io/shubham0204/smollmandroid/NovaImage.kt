package io.shubham0204.smollmandroid

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream

internal fun prepareImage(ctx: Context, uri: Uri, maxSide: Int): String {
    val cr = ctx.contentResolver
    val bounds = BitmapFactory.Options()
    bounds.inJustDecodeBounds = true
    cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (bounds.outWidth / sample > maxSide * 2 || bounds.outHeight / sample > maxSide * 2) {
        sample *= 2
    }
    val opts = BitmapFactory.Options()
    opts.inSampleSize = sample
    val bmp = cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
        ?: throw Exception("No se pudo leer la foto")
    var rot = 0
    try {
        cr.openInputStream(uri)?.use {
            val tag = ExifInterface.TAG_ORIENTATION
            val o = ExifInterface(it).getAttributeInt(tag, ExifInterface.ORIENTATION_NORMAL)
            rot = when (o) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90
                ExifInterface.ORIENTATION_ROTATE_180 -> 180
                ExifInterface.ORIENTATION_ROTATE_270 -> 270
                else -> 0
            }
        }
    } catch (e: Exception) {
        rot = 0
    }
    val m = Matrix()
    if (rot != 0) m.postRotate(rot.toFloat())
    val longest = maxOf(bmp.width, bmp.height)
    val scale = if (longest > maxSide) maxSide.toFloat() / longest else 1f
    m.postScale(scale, scale)
    val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
    val bos = ByteArrayOutputStream()
    out.compress(Bitmap.CompressFormat.JPEG, 80, bos)
    val b64 = Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP)
    return "data:image/jpeg;base64," + b64
}
