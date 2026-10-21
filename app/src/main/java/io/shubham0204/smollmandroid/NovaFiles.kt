package io.shubham0204.smollmandroid

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

internal class NovaFiles(
    private val act: ComponentActivity,
    private val send: (String, String) -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val picker =
        act.registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
            if (uri != null) read(uri)
        }

    fun pick() {
        picker.launch("*/*")
    }

    private fun read(uri: Uri) {
        scope.launch {
            try {
                val r = withContext(Dispatchers.IO) { load(uri) }
                val o = JSONObject().put("name", r.first).put("text", r.second)
                send("novaFile", o.toString())
            } catch (e: Exception) {
                send("novaNotice", e.message ?: "No pude leer el archivo")
            }
        }
    }

    private fun load(uri: Uri): Pair<String, String> {
        var name = "archivo"
        act.contentResolver.query(uri, null, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (i >= 0) name = c.getString(i) ?: "archivo"
            }
        }
        val low = name.lowercase()
        val no = listOf(".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip", ".png", ".jpg", ".jpeg", ".mp3", ".mp4")
        if (no.any { low.endsWith(it) }) {
            throw Exception("Por ahora solo leo archivos de texto (txt, md, csv, json, código)")
        }
        val stream = act.contentResolver.openInputStream(uri)
            ?: throw Exception("No se pudo abrir el archivo")
        val text = stream.bufferedReader(Charsets.UTF_8).use { r ->
            val buf = CharArray(6000)
            val n = r.read(buf)
            if (n <= 0) "" else String(buf, 0, n)
        }
        if (text.isBlank()) throw Exception("El archivo está vacío")
        val bad = text.count { it == '\u0000' || it == '\uFFFD' }
        if (bad > text.length / 20) throw Exception("Ese archivo no parece de texto")
        return Pair(name, text.take(4000))
    }
}
