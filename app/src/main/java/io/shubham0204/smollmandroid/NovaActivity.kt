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
                tts
