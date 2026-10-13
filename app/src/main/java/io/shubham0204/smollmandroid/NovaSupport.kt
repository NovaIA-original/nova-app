package io.shubham0204.smollmandroid

import android.net.Uri
import android.text.Html
import io.shubham0204.smollm.SmolLM
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder

internal data class NovaModel(
    val id: String,
    val name: String,
    val desc: String,
    val file: String,
    val url: String,
    val sizeMb: Int,
)

internal data class Hit(val title: String, val snippet: String, val url: String)

internal val MODELS = listOf(
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

private const val UA_WIKI = "NovaApp/1.0 (app personal)"
private const val UA_WEB = "Mozilla/5.0 (Android 14; Mobile) Chrome/124.0"
private val RE_TAG = Regex("<[^>]+>")
private val RE_LINK = Regex(
    "<a[^>]*class=\"result__a\"[^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>",
    RegexOption.DOT_MATCHES_ALL,
)
private val RE_SNIP = Regex(
    "<a[^>]*class=\"result__snippet\"[^>]*>(.*?)</a>",
    RegexOption.DOT_MATCHES_ALL,
)
private val RE_UDDG = Regex("uddg=([^\u0026]+)")

internal fun httpGet(url: String, ua: String): String {
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

internal fun cleanHtml(s: String): String =
    Html.fromHtml(RE_TAG.replace(s, ""), Html.FROM_HTML_MODE_LEGACY)
        .toString()
        .replace("\n", " ")
        .trim()

internal fun wikiSearch(q: String): List<Hit> {
    val url = Uri.Builder()
        .scheme("https")
        .authority("es.wikipedia.org")
        .path("/w/api.php")
        .appendQueryParameter("action", "query")
        .appendQueryParameter("generator", "search")
        .appendQueryParameter("gsrsearch", q)
        .appendQueryParameter("gsrlimit", "2")
        .appendQueryParameter("prop", "extracts")
        .appendQueryParameter("exintro", "1")
        .appendQueryParameter("explaintext", "1")
        .appendQueryParameter("exchars", "400")
        .appendQueryParameter("format", "json")
        .appendQueryParameter("utf8", "1")
        .appendQueryParameter("redirects", "1")
        .build()
        .toString()
    val root = JSONObject(httpGet(url, UA_WIKI))
    val query = root.optJSONObject("query") ?: return emptyList()
    val pages = query.optJSONObject("pages") ?: return emptyList()
    val found = ArrayList<Pair<Int, Hit>>()
    val keys = pages.keys()
    while (keys.hasNext()) {
        val o = pages.optJSONObject(keys.next()) ?: continue
        val extract = o.optString("extract").replace("\n", " ").trim()
        if (extract.isEmpty()) continue
        val link = Uri.Builder()
            .scheme("https")
            .authority("es.wikipedia.org")
            .path("/")
            .appendQueryParameter("curid", o.optInt("pageid").toString())
            .build()
            .toString()
        val hit = Hit(o.optString("title"), extract.take(380), link)
        found.add(Pair(o.optInt("index", 99), hit))
    }
    found.sortBy { it.first }
    return found.map { it.second }
}

internal fun webSearch(q: String): List<Hit> {
    val url = Uri.Builder()
        .scheme("https")
        .authority("html.duckduckgo.com")
        .path("/html/")
        .appendQueryParameter("kl", "es-es")
        .appendQueryParameter("q", q)
        .build()
        .toString()
    val html = httpGet(url, UA_WEB)
    val links = RE_LINK.findAll(html).toList()
    val snips = RE_SNIP.findAll(html).toList()
    val out = ArrayList<Hit>()
    for ((i, m) in links.withIndex()) {
        if (out.size >= 3) break
        var href = m.groupValues[1]
        val uddg = RE_UDDG.find(href)?.groupValues?.get(1)
        if (uddg != null) {
            href = URLDecoder.decode(uddg, "UTF-8")
        } else if (href.startsWith("//")) {
            href = "https:" + href
        }
        if (!href.startsWith("http")) continue
        if (href.contains("duckduckgo.com/y.js")) continue
        val title = cleanHtml(m.groupValues[2])
        val snip = if (i < snips.size) cleanHtml(snips[i].groupValues[1]) else ""
        out.add(Hit(title, snip.take(300), href))
    }
    return out
}

internal fun replayHistory(llm: SmolLM, history: String) {
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
        if (p.first == "user") {
            llm.addUserMessage(p.second)
        } else {
            llm.addAssistantMessage(p.second)
        }
    }
}
