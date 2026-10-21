#include <jni.h>

#include <atomic>
#include <exception>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

#include "llama.h"
#include "mtmd-helper.h"
#include "mtmd.h"

namespace {

std::atomic<int>  g_stage{0};
std::atomic<int>  g_tokens{0};
std::atomic<bool> g_cancel{false};
std::mutex        g_mutex;
std::string       g_partial;

std::string cleanUtf8(const std::string& s) {
    std::string out;
    size_t      i = 0;
    const size_t n = s.size();
    while (i < n) {
        unsigned char c   = static_cast<unsigned char>(s[i]);
        size_t        len = 0;
        if (c < 0x80) {
            len = 1;
        } else if ((c >> 5) == 0x6) {
            len = 2;
        } else if ((c >> 4) == 0xE) {
            len = 3;
        } else {
            i++;
            continue;
        }
        if (i + len > n) break;
        bool ok = true;
        for (size_t k = 1; k < len; k++) {
            if ((static_cast<unsigned char>(s[i + k]) >> 6) != 0x2) {
                ok = false;
                break;
            }
        }
        if (ok) {
            out.append(s, i, len);
            i += len;
        } else {
            i++;
        }
    }
    return out;
}

struct Res {
    llama_model*       model  = nullptr;
    llama_context*     lctx   = nullptr;
    mtmd_context*      mctx   = nullptr;
    mtmd_bitmap*       bmp    = nullptr;
    mtmd_input_chunks* chunks = nullptr;
    llama_sampler*     smpl   = nullptr;
    ~Res() {
        if (smpl) llama_sampler_free(smpl);
        if (chunks) mtmd_input_chunks_free(chunks);
        if (bmp) mtmd_bitmap_free(bmp);
        if (mctx) mtmd_free(mctx);
        if (lctx) llama_free(lctx);
        if (model) llama_model_free(model);
    }
};

std::string run(const std::string& modelPath, const std::string& mmprojPath, const std::vector<unsigned char>& jpeg,
                const std::string& prompt, int nThreads, int maxTokens) {
    llama_backend_init();
    Res r;

    llama_model_params mp = llama_model_default_params();
    r.model               = llama_model_load_from_file(modelPath.c_str(), mp);
    if (!r.model) throw std::runtime_error("No se pudo cargar el modelo de vision");
    g_stage = 10;

    llama_context_params cp = llama_context_default_params();
    cp.n_ctx                = 2048;
    cp.n_batch              = 512;
    cp.n_ubatch             = 512;
    cp.n_threads            = nThreads;
    cp.n_threads_batch      = nThreads;
    r.lctx                  = llama_init_from_model(r.model, cp);
    if (!r.lctx) throw std::runtime_error("No se pudo crear el contexto de vision");

    mtmd_context_params tp = mtmd_context_params_default();
    tp.use_gpu             = false;
    tp.n_threads           = nThreads;
    r.mctx                 = mtmd_init_from_file(mmprojPath.c_str(), r.model, tp);
    if (!r.mctx) throw std::runtime_error("No se pudo cargar el proyector de imagenes");
    g_stage = 20;

    r.bmp = mtmd_helper_bitmap_init_from_buf(r.mctx, jpeg.data(), jpeg.size());
    if (!r.bmp) throw std::runtime_error("No se pudo leer la foto");

    std::string text = std::string("<|im_start|>User:") + mtmd_default_marker() + prompt +
                       "<end_of_utterance>\nAssistant:";
    mtmd_input_text input;
    input.text          = text.c_str();
    input.add_special   = true;
    input.parse_special = true;

    r.chunks                = mtmd_input_chunks_init();
    const mtmd_bitmap* bm[] = {r.bmp};
    int32_t            rc   = mtmd_tokenize(r.mctx, r.chunks, &input, bm, 1);
    if (rc != 0) throw std::runtime_error("No se pudo preparar la foto, codigo " + std::to_string(rc));
    g_stage = 30;

    llama_pos nPast = 0;
    rc              = mtmd_helper_eval_chunks(r.mctx, r.lctx, r.chunks, 0, 0, cp.n_batch, true, &nPast);
    if (rc != 0) throw std::runtime_error("Fallo al mirar la foto, codigo " + std::to_string(rc));
    g_stage = 90;

    r.smpl = llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(r.smpl, llama_sampler_init_greedy());
    const llama_vocab* vocab = llama_model_get_vocab(r.model);

    std::string out;
    for (int i = 0; i < maxTokens && !g_cancel.load(); i++) {
        llama_token tok = llama_sampler_sample(r.smpl, r.lctx, -1);
        if (llama_vocab_is_eog(vocab, tok)) break;
        char buf[256];
        int  n = llama_token_to_piece(vocab, tok, buf, sizeof(buf), 0, true);
        if (n > 0) out.append(buf, static_cast<size_t>(n));
        g_tokens = i + 1;
        g_stage  = 90 + (i * 10) / maxTokens;
        {
            std::lock_guard<std::mutex> lock(g_mutex);
            g_partial = cleanUtf8(out);
        }
        llama_batch b = llama_batch_get_one(&tok, 1);
        if (llama_decode(r.lctx, b) != 0) break;
    }
    return cleanUtf8(out);
}

}  // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_io_shubham0204_smollm_NovaVision_describe(JNIEnv* env, jobject /*thiz*/, jstring jModel, jstring jMmproj,
                                               jbyteArray jJpeg, jstring jPrompt, jint nThreads, jint maxTokens) {
    const char* m  = env->GetStringUTFChars(jModel, nullptr);
    const char* p  = env->GetStringUTFChars(jMmproj, nullptr);
    const char* q  = env->GetStringUTFChars(jPrompt, nullptr);
    std::string model(m), mmproj(p), prompt(q);
    env->ReleaseStringUTFChars(jModel, m);
    env->ReleaseStringUTFChars(jMmproj, p);
    env->ReleaseStringUTFChars(jPrompt, q);

    jsize                      len = env->GetArrayLength(jJpeg);
    std::vector<unsigned char> jpeg(static_cast<size_t>(len));
    env->GetByteArrayRegion(jJpeg, 0, len, reinterpret_cast<jbyte*>(jpeg.data()));

    g_stage  = 0;
    g_tokens = 0;
    g_cancel = false;
    {
        std::lock_guard<std::mutex> lock(g_mutex);
        g_partial.clear();
    }
    try {
        std::string res = run(model, mmproj, jpeg, prompt, nThreads, maxTokens);
        return env->NewStringUTF(res.c_str());
    } catch (std::exception& e) {
        env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), e.what());
        return nullptr;
    }
}

extern "C" JNIEXPORT jint JNICALL
Java_io_shubham0204_smollm_NovaVision_stage(JNIEnv* /*env*/, jobject /*thiz*/) {
    return g_stage.load();
}

extern "C" JNIEXPORT jint JNICALL
Java_io_shubham0204_smollm_NovaVision_tokens(JNIEnv* /*env*/, jobject /*thiz*/) {
    return g_tokens.load();
}

extern "C" JNIEXPORT jstring JNICALL
Java_io_shubham0204_smollm_NovaVision_partial(JNIEnv* env, jobject /*thiz*/) {
    std::string s;
    {
        std::lock_guard<std::mutex> lock(g_mutex);
        s = g_partial;
    }
    return env->NewStringUTF(s.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_io_shubham0204_smollm_NovaVision_cancel(JNIEnv* /*env*/, jobject /*thiz*/) {
    g_cancel = true;
}
