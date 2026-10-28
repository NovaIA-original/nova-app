package io.shubham0204.smollmandroid

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.AlarmClock
import android.provider.MediaStore
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal class NovaExtras(
    private val act: ComponentActivity,
    private val send: (String, String) -> Unit,
    private val onPhoto: (Uri) -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var pendingExport = ""
    private var camUri: Uri? = null

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
            if (ok && u != null) onPhoto(u)
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
