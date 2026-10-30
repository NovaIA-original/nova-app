package io.shubham0204.smollmandroid

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.util.Base64
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
import io.shubham0204.smollm.NovaVision
import io.shubham0204.smollm.SmolLM
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
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
import java.util.Locale

class NovaActivity : ComponentActivity() {

    private val systemPrompt =
        "Eres Nova, una asistente de inteligencia artificial amable y directa. " +
            "Eres una IA sin cuerpo: no tienes manos, fotos ni cara. " +
            "Responde siempre en español. " +
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
    private var visionJob: Job? = null
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

    private val mic = NovaMic(this) { fn, arg -> js(fn, arg) }
    private val files = NovaFiles(this) { fn, arg -> js(fn, arg) }
    private val extras = NovaExtras(this, { fn, arg -> js(fn, arg) }, { uri -> loadPhoto(uri) })

    private val imgPicker =
        registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
            if (uri != null) loadPhoto(uri)
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

                tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val def = Locale.getDefault()
                val loc = if (def.language == "es") def else Locale("es", "ES")
                tts?.setLanguage(loc)
                ttsReady = true
            }
        }

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0F1115"))
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
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

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        extras.run("share", "", intent)
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        mic.destroy()
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
            runOnUiThread { mic.start() }
        }

        @JavascriptInterface
        fun stopListen() {
            runOnUiThread { mic.stop() }
        }

        @JavascriptInterface
        fun pickImage() {
            runOnUiThread { imgPicker.launch("image/*") }
        }

        @JavascriptInterface
        fun pickFile() {
            runOnUiThread { files.pick() }
        }

        @JavascriptInterface
        fun cmd(name: String, arg: String) {
            runOnUiThread { extras.run(name, arg, this@NovaActivity.intent) }
        }

        @JavascriptInterface
        fun describe(b64: String, prompt: String) {
            runOnUiThread { describePhoto(b64, prompt) }
        }

        @JavascriptInterface
        fun cancelVision() {
            NovaVision.cancel()
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

    private fun loadPhoto(uri: Uri) {
        scope.launch {
            try {
                val data = withContext(Dispatchers.IO) {
                    prepareImage(this@NovaActivity, uri, 512)
                }
                js("novaImage", data)
            } catch (e: Exception) {
                js("novaNotice", e.message ?: "No se pudo leer la foto")
            }
        }
    }

    private fun copyText(text: String) {
        copyClip(this, text)
    }

    private fun speakText(text: String, pitch: Float) {
        val t = tts ?: return
        if (!ttsReady) return
        t.setPitch(pitch.coerceIn(0.5f, 2.0f))
        val clean = text.replace(Regex("[*_`#>]"), "").take(3500)
        t.speak(clean, TextToSpeech.QUEUE_FLUSH, null, "nova")
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
                val colDone = c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
                val colTotal = c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
                val done = c.getLong(colDone)
                var total = c.getLong(colTotal)
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
                            val msg = "La descarga falló: " + m.name
                            js("novaNotice", msg)
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
        if (m == null || m.id.startsWith("vista") || refreshDownload(m) != "ready") {
            js0("novaNeedModel()")
            return
        }
        val more = extra.trim().take(1500)
        val sp = if (more.isEmpty()) systemPrompt else systemPrompt + " " + more
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
                        replayHistory(llm, history)
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
                    if (!tmp.renameTo(dest)) {
                        throw Exception("No se pudo guardar")
                    }
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

        private fun searchWeb(q: String) {
        scope.launch { js("novaResults", hitsJson(searchBoth(q))) }
    }

    private fun describePhoto(b64: String, prompt: String) {
        val mm = MODELS.firstOrNull { it.id == "vista" }
        val pj = MODELS.firstOrNull { it.id == "vista_mm" }
        if (mm == null || pj == null || refreshDownload(mm) != "ready" || refreshDownload(pj) != "ready") {
            js0("novaVisionMissing()")
            return
        }
        val bytes = try {
            Base64.decode(b64.substringAfter(","), Base64.DEFAULT)
        } catch (e: Exception) {
            js("novaVisionError", "La foto no es válida")
            return
        }
        visionJob?.cancel()
        visionJob = scope.launch {
            engineLock.withLock {
                try {
                    generating?.cancelAndJoin()
                    loaded = false
                    js0("novaVisionStage(0,0,\"\")")
                    withContext(Dispatchers.Default) {
                        try {
                            llm.close()
                        } catch (e: Exception) {
                        }
                    }
                    val poll = launch {
                        while (true) {
                            val p = JSONObject.quote(NovaVision.partial())
                            js0("novaVisionStage(" + NovaVision.stage() + "," + NovaVision.tokens() + "," + p + ")")
                            delay(300)
                        }
                    }
                    val text = try {
                        withContext(Dispatchers.Default) {
                            val a1 = modelFile(mm).absolutePath
                            val a2 = modelFile(pj).absolutePath
                            NovaVision.describe(a1, a2, bytes, prompt, 4, 200)
                        }
                    } finally {
                        poll.cancel()
                    }
                    js("novaVisionDone", text)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Throwable) {
                    js("novaVisionError", e.message ?: "Error en la visión")
                }
            }
        }
    }
}
