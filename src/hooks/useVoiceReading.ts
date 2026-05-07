import { useCallback, useEffect, useRef, useState } from 'react';

export function useVoiceReading() {
  const [isReading, setIsReading] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setIsSupported('speechSynthesis' in window);
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsReading(false);
  }, []);

  const read = useCallback((text: string, lang = 'en-US') => {
    if (!('speechSynthesis' in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.onstart = () => setIsReading(true);
    utterance.onend = () => setIsReading(false);
    utterance.onerror = () => setIsReading(false);
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  const toggle = useCallback((text: string, lang = 'en-US') => {
    if (isReading) { stop(); } else { read(text, lang); }
  }, [isReading, read, stop]);

  return { isReading, isSupported, read, stop, toggle };
}
