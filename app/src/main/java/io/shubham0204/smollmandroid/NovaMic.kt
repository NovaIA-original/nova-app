package io.shubham0204.smollmandroid

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

class NovaMic(
    private val act: ComponentActivity,
    private val send: (String, String) -> Unit,
) {
    private var rec: SpeechRecognizer? = null

    private val perm =
        act.registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
            if (ok) {
                begin()
            } else {
                send("novaNotice", "Sin permiso de micrófono")
            }
        }

    fun start() {
        val p = ContextCompat.checkSelfPermission(act, Manifest.permission.RECORD_AUDIO)
        if (p == PackageManager.PERMISSION_GRANTED) {
            begin()
        } else {
            perm.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    fun stop() {
        rec?.stopListening()
    }

    fun destroy() {
        rec?.destroy()
        rec = null
    }

    private fun first(b: Bundle?): String {
        val list = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        return list?.firstOrNull() ?: ""
    }

    private fun begin() {
        if (!SpeechRecognizer.isRecognitionAvailable(act)) {
            send("novaNotice", "Tu celular no tiene reconocimiento de voz")
            return
        }
        rec?.destroy()
        val r = SpeechRecognizer.createSpeechRecognizer(act)
        r.setRecognitionListener(
            object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    send("novaListening", "1")
                }

                override fun onBeginningOfSpeech() {}

                override fun onRmsChanged(rmsdB: Float) {}

                override fun onBufferReceived(buffer: ByteArray?) {}

                override fun onEndOfSpeech() {}

                override fun onEvent(eventType: Int, params: Bundle?) {}

                override fun onError(error: Int) {
                    send("novaListening", "0")
                    send("novaNotice", errorText(error))
                }

                override fun onResults(results: Bundle?) {
                    send("novaListening", "0")
                    val t = first(results)
                    if (t.isNotBlank()) {
                        send("novaHeard", t)
                    } else {
                        send("novaNotice", "No te escuché, intenta de nuevo")
                    }
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val t = first(partialResults)
                    if (t.isNotBlank()) send("novaPartialHeard", t)
                }
            },
        )
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        val free = RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, free)
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES")
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        r.startListening(i)
        rec = r
    }

    private fun errorText(code: Int): String =
        when (code) {
            SpeechRecognizer.ERROR_NETWORK,
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
            -> "Sin internet: el micrófono de Google lo necesita"
            SpeechRecognizer.ERROR_NO_MATCH,
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
            -> "No te escuché, intenta de nuevo"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Falta el permiso del micrófono"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "El micrófono está ocupado"
            else -> "Error de micrófono (código " + code + ")"
        }
}
