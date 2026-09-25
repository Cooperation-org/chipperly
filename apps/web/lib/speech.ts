import { Capacitor, registerPlugin } from '@capacitor/core';

interface SpeechPlugin {
  speak(options: { text: string }): Promise<void>;
  stop(): Promise<void>;
}

/** Android's WebView has no speechSynthesis, so the app speaks through the device's TTS engine (SpeechPlugin.java). */
const NativeSpeech = registerPlugin<SpeechPlugin>('Speech');

function onAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** Whether read-aloud can work here: the Android app, or any browser/WebView with speechSynthesis (iOS app included). */
export function canSpeak(): boolean {
  if (typeof window === 'undefined') return false;
  return onAndroid() || 'speechSynthesis' in window;
}

/** Says `text`, cutting off anything still being said. Best effort: never throws. */
export function speak(text: string): void {
  if (!text.trim() || !canSpeak()) return;
  if (onAndroid()) {
    void NativeSpeech.speak({ text }).catch(() => {});
    return;
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

export function stopSpeaking(): void {
  if (!canSpeak()) return;
  if (onAndroid()) void NativeSpeech.stop().catch(() => {});
  else window.speechSynthesis.cancel();
}
