package io.shubham0204.smollmandroid

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.text.Html
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import io.shubham0204.smollm.SmolLM
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import java.util.Locale

private data class NovaModel(
    val id: String,
    val name: String,
    val desc: String,
    val file: String,
    val url: String,
    val sizeMb: Int,
)

private data class Hit(val title: String, val snippet: String, val url: String)

private val MODELS = listOf(
    NovaModel(
        "rapida",
        "Nova Rápida",
        "Responde más rápido",
        "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
        490,
    ),
    NovaModel(
        "nova",
        "Nova",
        "Más lista, un poco más lenta",
        "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
        1117,
    ),
)

class NovaActivity : ComponentActivity() {

    private val systemPrompt =
        "Eres Nova, una asistente de inteligencia artificial amable y directa. " +
            "Eres una IA sin cuerpo: no tienes manos, fotos ni cara. " +
            "Responde siempre en español, con frases cortas. " +
            "Si no sabes algo, dilo con honestidad en vez de inventar."

    private lateinit var web: WebView
    private val llm = SmolLM()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val engineLock = Mutex()
    private var loaded = false
    private var generating: Job? = null
    private var reloadJob: Job? = null
    private var pollJob: Job? = null
    private val active = mutableSetOf<String>()
    private var pickId: String? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    private val modelsDir: File by lazy { getExternalFilesDir(null) ?: filesDir }
    private val dm by lazy { getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager }
    private val prefs by lazy { getSharedPreferences("nova", MODE_PRIVATE) }
    private val dataFile by lazy { File(filesDir, "nova-data.json") }

    private val picker =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
            val id = pickId
            if (uri != null && id != null) copyModel(id, uri)
        }

    private val speechLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
            val text = res.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
            if (res.resultCode == RESULT_OK && !text.isNullOrBlank()) {
                js("novaHeard", text)
            } else {
                js0("novaHeardNone()")
            }
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val loc = if (Locale.getDefault().language == "es") Locale.getDefault() else Locale("es", "ES")
                tts?.setLanguage(loc)
                ttsReady = true
            }
        }

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0F1115"))
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.scheme == "http" || u.scheme == "https") {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, u))
                    } catch (e: Exception) {
                    }
                    return true
                }
                return false
            }
        }
        web.addJavascriptInterface(Bridge(), "NovaBridge")

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.parseColor("#0F1115"))
        root.addView(
            web,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
        WindowCompat.getInsetsController(window, root).isAppearanceLightStatusBars = false
        setContentView(root)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    web.evaluateJavascript("novaBack()") { r ->
                        if (r != "true") {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                        }
                    }
                }
            },
        )

        web.loadUrl("file:///android_asset/nova.html")
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (e: Exception) {
        }
        try {
            llm.close()
        } catch (e: Exception) {
        }
    }

    inner class Bridge {
        @JavascriptInterface
        fun loadData(): String =
            try {
                if (dataFile.exists()) dataFile.readText() else ""
            } catch (e: Exception) {
                ""
            }

        @JavascriptInterface
        fun saveData(json: String) {
            Thread {
                try {
                    val tmp = File(filesDir, "nova-data.tmp")
                    tmp.writeText(json)
                    tmp.renameTo(dataFile)
                } catch (e: Exception) {
                }
            }.start()
        }

        @JavascriptInterface
        fun getModels(): String = modelsJson()

        @JavascriptInterface
        fun begin() {
            runOnUiThread {
                if (MODELS.any { refreshDownload(it) == "downloading" }) startPolling()
            }
        }

        @JavascriptInterface
        fun download(id: String) {
            runOnUiThread { MODELS.firstOrNull { it.id == id }?.let { startDownload(it) } }
        }

        @JavascriptInterface
        fun pick(id: String) {
            runOnUiThread {
                pickId = id
                picker.launch(arrayOf("*/*"))
            }
        }

        @JavascriptInterface
        fun startChat(id: String, history: String, extra: String) {
            runOnUiThread { openChat(id, history, extra) }
        }

        @JavascriptInterface
        fun send(text: String) {
            runOnUiThread { ask(text) }
        }

        @JavascriptInterface
        fun stop() {
            runOnUiThread { generating?.cancel() }
        }

        @JavascriptInterface
        fun search(q: String) {
            runOnUiThread { searchWeb(q) }
        }

        @JavascriptInterface
        fun listen() {
            runOnUiThread { startListening() }
        }

        @JavascriptInterface
        fun speak(text: String, pitch: Double) {
            runOnUiThread { speakText(text, pitch.toFloat()) }
        }

        @JavascriptInterface
        fun stopSpeak() {
            runOnUiThread { tts?.stop() }
        }

        @JavascriptInterface
        fun copy(text: String) {
            runOnUiThread { copyText(text) }
        }
    }

    private fun js0(code: String) {
        web.evaluateJavascript(code, null)
    }

    private fun js(fn: String, arg: String) {
        val q = JSONObject.quote(arg)
            .replace("\u2028", "\\u2028")
            .replace("\u2029", "\\u2029")
        web.evaluateJavascript("$fn($q)", null)
    }

    private fun copyText(text: String) {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("Nova", text))
    }

    private fun speakText(text: String, pitch: Float) {
        val t = tts ?: return
        if (!ttsReady) return
        t.setPitch(pitch.coerceIn(0.5f, 2.0f))
        val clean = text.replace(Regex("[*_`#>]"), "").take(3500)
        t.speak(clean, TextToSpeech.QUEUE_FLUSH, null, "nova")
    }

    private fun startListening() {
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES")
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Habla con Nova")
        i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        try {
            speechLauncher.launch(i)
        } catch (e: Exception) {
            js("novaNotice", "Tu celular no tiene reconocimiento de voz disponible")
        }
    }

    private fun modelFile(m: NovaModel) = File(modelsDir, m.file)

    private fun refreshDownload(m: NovaModel): String {
        val key = "dl_" + m.id
        val id = prefs.getLong(key, -1L)
        if (id >= 0) {
            var status = -1
            dm.query(DownloadManager.Query().setFilterById(id)).use { c ->
                if (c.moveToFirst()) {
                    status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                }
            }
            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                prefs.edit().remove(key).apply()
            } else if (status == -1 || status == DownloadManager.STATUS_FAILED) {
                prefs.edit().remove(key).apply()
                modelFile(m).delete()
                return "none"
            } else {
                return "downloading"
            }
        }
        val f = modelFile(m)
        return if (f.exists() && f.length() > m.sizeMb * 950_000L) "ready" else "none"
    }

    private fun progressOf(m: NovaModel): Int {
        val id = prefs.getLong("dl_" + m.id, -1L)
        if (id < 0) return 0
        dm.query(DownloadManager.Query().setFilterById(id)).use { c ->
            if (c.moveToFirst()) {
                val done = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                var total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                if (total <= 0) total = m.sizeMb * 1_000_000L
                return (done * 100 / total).toInt().coerceIn(0, 100)
            }
        }
        return 0
    }

    private fun modelsJson(): String {
        val arr = JSONArray()
        for (m in MODELS) {
            arr.put(
                JSONObject()
                    .put("id", m.id)
                    .put("name", m.name)
                    .put("desc", m.desc)
                    .put("size", m.sizeMb)
                    .put("state", refreshDownload(m))
                    .put("pct", 0)
            )
        }
        return arr.toString()
    }

    private fun startDownload(m: NovaModel) {
        if (refreshDownload(m) != "none") {
            startPolling()
            return
        }
        modelFile(m).delete()
        try {
            val req = DownloadManager.Request(Uri.parse(m.url))
                .setTitle("Nova: " + m.name)
                .setDescription("Descargando el cerebro de Nova")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)
                .setDestinationInExternalFilesDir(this, null, m.file)
            val id = dm.enqueue(req)
            prefs.edit().putLong("dl_" + m.id, id).apply()
            startPolling()
        } catch (e: Exception) {
            js("novaNotice", e.message ?: "No se pudo iniciar la descarga")
            js("novaModels", modelsJson())
        }
    }

    private fun startPolling() {
        if (pollJob?.isActive == true) return
        pollJob = scope.launch {
            while (true) {
                for (m in MODELS) {
                    val state = withContext(Dispatchers.IO) { refreshDownload(m) }
                    if (state == "downloading") {
                        active.add(m.id)
                        val pct = withContext(Dispatchers.IO) { progressOf(m) }
                        js0("novaProgress(" + JSONObject.quote(m.id) + ", " + pct + ")")
                    } else if (active.remove(m.id)) {
                        js("novaModels", modelsJson())
                        if (state == "ready") {
                            js("novaDownloaded", m.id)
                        } else {
                            js("novaNotice", "La descarga de " + m.name + " no terminó. Inténtalo de nuevo.")
                        }
                    }
                }
                if (active.isEmpty()) break
                delay(800)
            }
        }
    }

    private fun openChat(modelId: String, history: String, extra: String) {
        val m = MODELS.firstOrNull { it.id == modelId }
        if (m == null || refreshDownload(m) != "ready") {
            js0("novaNeedModel()")
            return
        }
        val sp = if (extra.isBlank()) systemPrompt else systemPrompt + " " + extra.trim().take(1500)
        reloadJob?.cancel()
        reloadJob = scope.launch {
            engineLock.withLock {
                try {
                    generating?.cancelAndJoin()
                    loaded = false
                    js("novaStatus", "cargando a " + m.name + "...")
                    withContext(Dispatchers.Default) {
                        try {
                            llm.close()
                        } catch (e: Exception) {
                        }
                    }
                    llm.load(
                        modelFile(m).absolutePath,
                        SmolLM.InferenceParams(contextSize = 3072L, numThreads = 4),
                    )
                    withContext(Dispatchers.Default) {
                        llm.addSystemPrompt(sp)
                        replay(history)
                    }
                    loaded = true
                    js0("novaReady()")
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    js("novaError", e.message ?: "No se pudo cargar el modelo")
                }
            }
        }
    }

    private fun replay(history: String) {
        val arr = try {
            JSONArray(history)
        } catch (e: Exception) {
            return
        }
        val all = ArrayList<Pair<String, String>>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val role = o.optString("role")
            val content = o.optString("content")
            if (content.isNotEmpty() && (role == "user" || role == "assistant")) {
                all.add(Pair(role, content))
            }
        }
        var budget = 3000
        val keep = ArrayList<Pair<String, String>>()
        for (i in all.indices.reversed()) {
            val len = all[i].second.length
            if (len > budget) break
            budget -= len
            keep.add(0, all[i])
        }
        while (keep.isNotEmpty() && keep[0].first != "user") keep.removeAt(0)
        for (p in keep) {
            if (p.first == "user") llm.addUserMessage(p.second) else llm.addAssistantMessage(p.second)
        }
    }

    private fun ask(text: String) {
        if (!loaded || generating?.isActive == true) return
        generating = scope.launch {
            var acc = ""
            try {
                llm.getResponseAsFlow(text).flowOn(Dispatchers.Default).collect { piece ->
                    acc += piece
                    js("novaPartial", acc)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                js("novaError", e.message ?: "Error al responder")
            } finally {
                js("novaDone", acc)
            }
            val used = try {
                llm.getContextLengthUsed()
            } catch (e: Exception) {
                0
            }
            if (used > 2300) js0("novaRebuild()")
        }
    }

    private fun copyModel(id: String, uri: Uri) {
        val m = MODELS.firstOrNull { it.id == id } ?: return
        js("novaStatus", "copiando el modelo...")
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val tmp = File(modelsDir, m.file + ".tmp")
                    val input = contentResolver.openInputStream(uri)
                        ?: throw Exception("No se pudo abrir el archivo")
                    input.use { i -> tmp.outputStream().use { o -> i.copyTo(o) } }
                    val dest = modelFile(m)
                    dest.delete()
                    if (!tmp.renameTo(dest)) throw Exception("No se pudo guardar el modelo")
                }
                js("novaModels", modelsJson())
                js("novaDownloaded", m.id)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                js("novaNotice", e.message ?: "Falló la copia")
                js("novaModels", modelsJson())
            }
        }
    }

    private fun httpGet(url: String, ua: String): String {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 8000
        c.readTimeout = 10000
        c.setRequestProperty("User-Agent", ua)
        c.setRequestProperty("Accept-Language", "es-ES,es;q=0.9")
        try {
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally {
            c.disconnect()
        }
    }

    private fun cleanHtml(s: String): String =
        Html.fromHtml(s.replace(Regex("<[^>]+>"), ""), Html.FROM_HTML_MODE_LEGACY)
            .toString()
            .replace("\n", " ")
            .trim()

    private fun wikiSearch(q: String): List<Hit> {
        val url = "https://es.wikipedia.org/w/api.php?action=query&gener
