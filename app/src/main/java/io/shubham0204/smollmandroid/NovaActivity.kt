package io.shubham0204.smollmandroid

import android.annotation.SuppressLint
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import io.shubham0204.smollm.SmolLM
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class NovaActivity : ComponentActivity() {

    private val systemPrompt =
        "Eres Nova, un asistente amable y directo. Responde siempre en español, con frases cortas."
    private val modelUrl =
        "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf"

    private lateinit var web: WebView
    private val llm = SmolLM()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var loaded = false
    private var generating: Job? = null
    private val modelFile by lazy { File(filesDir, "nova-model.gguf") }

    private val picker =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
            if (uri != null) copyModel(uri)
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0F1115"))
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = WebViewClient()
        web.addJavascriptInterface(Bridge(), "NovaBridge")
        ViewCompat.setOnApplyWindowInsetsListener(web) { v, insets ->
            val b = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(b.left, b.top, b.right, b.bottom)
            insets
        }
        setContentView(web)
        web.loadUrl("file:///android_asset/nova.html")
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        try {
            llm.close()
        } catch (e: Exception) {
        }
    }

    inner class Bridge {
        @JavascriptInterface
        fun begin() {
            runOnUiThread { prepare() }
        }

        @JavascriptInterface
        fun download() {
            runOnUiThread { downloadModel() }
        }

        @JavascriptInterface
        fun pick() {
            runOnUiThread { picker.launch(arrayOf("*/*")) }
        }

        @JavascriptInterface
        fun send(text: String) {
            runOnUiThread { ask(text) }
        }

        @JavascriptInterface
        fun reset() {
            runOnUiThread { resetModel() }
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

    private fun prepare() {
        if (loaded) {
            js0("novaReady()")
        } else if (modelFile.exists() && modelFile.length() > 100_000_000L) {
            loadModel()
        } else {
            js0("novaNeedModel()")
        }
    }

    private fun loadModel() {
        js("novaStatus", "Despertando a Nova...")
        scope.launch {
            try {
                llm.load(
                    modelFile.absolutePath,
                    SmolLM.InferenceParams(contextSize = 2048L, numThreads = 4),
                )
                llm.addSystemPrompt(systemPrompt)
                loaded = true
                js0("novaReady()")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                js("novaError", e.message ?: "No se pudo cargar el modelo")
                js0("novaNeedModel()")
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
            if (used > 1500) {
                loaded = false
                js("novaStatus", "Nova está reiniciando su memoria...")
                llm.close()
                loadModel()
            }
        }
    }

    private fun resetModel() {
        loaded = false
        scope.launch {
            generating?.cancelAndJoin()
            llm.close()
            loadModel()
        }
    }

    private fun downloadModel() {
        js0("novaProgress(0)")
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val tmp = File(filesDir, "nova-model.part")
                    val conn = URL(modelUrl).openConnection() as HttpURLConnection
                    conn.connectTimeout = 20000
                    conn.readTimeout = 30000
                    conn.instanceFollowRedirects = true
                    val total = conn.contentLengthLong
                    conn.inputStream.use { input ->
                        tmp.outputStream().use { out ->
                            val buf = ByteArray(64 * 1024)
                            var done = 0L
                            var last = 0
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                                done += n
                                val pct = if (total > 0) (done * 100 / total).toInt() else 0
                                if (pct != last) {
                                    last = pct
                                    withContext(Dispatchers.Main) { js0("novaProgress($pct)") }
                                }
                            }
                        }
                    }
                    modelFile.delete()
                    if (!tmp.renameTo(modelFile)) throw Exception("No se pudo guardar el modelo")
                }
                loadModel()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                js("novaError", e.message ?: "Falló la descarga")
                js0("novaNeedModel()")
            }
        }
    }

    private fun copyModel(uri: Uri) {
        js("novaStatus", "Copiando el modelo, espera un momento...")
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val tmp = File(filesDir, "nova-model.part")
                    val input = contentResolver.openInputStream(uri)
                        ?: throw Exception("No se pudo abrir el archivo")
                    input.use { i -> tmp.outputStream().use { o -> i.copyTo(o) } }
                    modelFile.delete()
                    if (!tmp.renameTo(modelFile)) throw Exception("No se pudo guardar el modelo")
                }
                loadModel()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                js("novaError", e.message ?: "Falló la copia")
                js0("novaNeedModel()")
            }
        }
    }
}
