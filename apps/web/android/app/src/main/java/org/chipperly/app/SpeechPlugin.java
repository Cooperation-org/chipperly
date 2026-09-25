package org.chipperly.app;

import android.speech.tts.TextToSpeech;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * Read-aloud for the Android app. Android's WebView has no
 * window.speechSynthesis, so lib/speech.ts calls this on Android and the
 * browser's own voice everywhere else (iOS's WKWebView has one). Uses the
 * device's installed TTS engine, which works offline once its voice is
 * downloaded (most phones ship with one).
 */
@CapacitorPlugin(name = "Speech")
public class SpeechPlugin extends Plugin {
    private TextToSpeech tts;
    private boolean ready = false;
    /** Said as soon as the engine finishes starting, so the first tap isn't silent. */
    private String pending;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), status -> {
            ready = status == TextToSpeech.SUCCESS;
            if (!ready) return;
            tts.setLanguage(Locale.getDefault());
            if (pending != null) {
                say(pending);
                pending = null;
            }
        });
    }

    private void say(String text) {
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "chipperly");
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text.isEmpty()) {
            call.resolve();
            return;
        }
        if (ready) say(text);
        else pending = text;
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        pending = null;
        if (tts != null) tts.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) tts.shutdown();
    }
}
