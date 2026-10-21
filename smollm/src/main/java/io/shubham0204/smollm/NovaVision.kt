package io.shubham0204.smollm

object NovaVision {
    external fun describe(
        model: String,
        mmproj: String,
        jpeg: ByteArray,
        prompt: String,
        threads: Int,
        maxTokens: Int,
    ): String

    external fun stage(): Int

    external fun tokens(): Int

    external fun partial(): String

    external fun cancel()
}
