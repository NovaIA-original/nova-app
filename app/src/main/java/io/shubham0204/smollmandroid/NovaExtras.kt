package io.shubham0204.smollmandroid

import android.content.Intent
import android.net.Uri
import android.provider.AlarmClock
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

internal class NovaExtras(
    private val act: ComponentActivity,
    private val send: (String, String) -> Unit,
    private val onPhoto: (Uri) -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var pendingExport = ""
    private var camUri: Uri? = null
    private var camFile: File? = null

    private val exporter =
        act.registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri: Uri? ->
            if (uri != null) writeExport(uri)
        }

    private val importer =
        act.registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
            if (uri != null) readImport(uri)
        }

    private val camera =
        act.registerForActivityResult(ActivityResultContracts.TakePicture()) { ok: Boolean ->
            val u = camUri
            val f = camFile
            if (ok && u != null) {
                onPhoto(u)
                scope.launch {
                    delay(60000)
                    f?.delete()
                }
            } else {
                f?.delete()
            }
        }

    fun run(name: String, arg: String, intent: Intent?) {
        when (name) {
            "ready", "share" -> handleIntent(intent)
            "export" -> {
                pendingExport = arg
                exporter.launch("nova-chats.json")
            }
            "import" -> importer.launch(arrayOf("*/*"))
            "camera" -> takePhoto()
            "alarm" -> alarm(arg)
            "timer" -> timer(arg)
        }
    }

    private fun writeExport(uri: Uri) {
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val out = act.contentResolver.openOutputStream(uri, "wt")
                        ?: throw Exception("No se pudo guardar el archivo")
                    out.use { it.write(pendingExport.toByteArray(Charsets.UTF_8)) }
                }
                send("novaNotice", "Chats guardados")
            } catch (e: Exception) {
                send("novaNotice", e.message ?: "No se pudo guardar")
            }
        }
    }

        private fun readImport(uri: Uri) {
        scope.launch {
            try {
                val text = withContext(Dispatchers.IO) {
                    val input = act.contentResolver.openInputStream(uri)
                        ?: throw Exception("No se pudo abrir el archivo")
                    input.bufferedReader(Charsets.UTF_8).use { it.readText() }
                }
                send("novaImport", text.take(8_000_000))
            } catch (e: Exception) {
                send("novaNotice", e.message ?: "No se pudo leer el archivo")
            }
        }
    }

    private fun takePhoto() {
        val dir = File(act.cacheDir, "cam")
        dir.mkdirs()
        dir.listFiles()?.forEach { it.delete() }
        val f = File(dir, "foto_" + System.currentTimeMillis() + ".jpg")
        val u = try {
            FileProvider.getUriForFile(act, act.packageName + ".fileprovider", f)
        } catch (e: Exception) {
            null
        }
        if (u == null) {
            send("novaNotice", "No se pudo abrir la cámara")
            return
        }
        camUri = u
        camFile = f
        try {
            camera.launch(u)
        } catch (e: Exception) {
            send("novaNotice", "No se pudo abrir la cámara")
        }
    }

    private fun alarm(arg: String) {
        val p = arg.split("|")
        val hm = p[0].split(":")
        val h = hm.getOrNull(0)?.toIntOrNull() ?: return
        val m = hm.getOrNull(1)?.toIntOrNull() ?: 0
        val i = Intent(AlarmClock.ACTION_SET_ALARM)
            .putExtra(AlarmClock.EXTRA_HOUR, h)
            .putExtra(AlarmClock.EXTRA_MINUTES, m)
            .putExtra(AlarmClock.EXTRA_MESSAGE, p.getOrNull(1) ?: "Nova")
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        launchClock(i)
    }

    private fun timer(arg: String) {
        val p = arg.split("|")
        val s = p[0].toIntOrNull() ?: return
        val i = Intent(AlarmClock.ACTION_SET_TIMER)
            .putExtra(AlarmClock.EXTRA_LENGTH, s)
            .putExtra(AlarmClock.EXTRA_MESSAGE, p.getOrNull(1) ?: "Nova")
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        launchClock(i)
    }

    private fun launchClock(i: Intent) {
        try {
            act.startActivity(i)
        } catch (e: Exception) {
            send("novaNotice", "No pude usar el reloj: " + (e.message ?: "error"))
        }
    }

    private fun handleIntent(i: Intent?) {
        if (i == null || i.action != Intent.ACTION_SEND) return
        val type = i.type ?: return
        if (type.startsWith("text/")) {
            val t = i.getStringExtra(Intent.EXTRA_TEXT)
            if (!t.isNullOrBlank()) send("novaShared", t.take(3000))
        } else if (type.startsWith("image/")) {
            @Suppress("DEPRECATION")
            val u = i.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            if (u != null) onPhoto(u)
        }
        i.action = null
    }
}
