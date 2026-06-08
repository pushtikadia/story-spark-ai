import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WordRange = {
  start: number;
  end: number;
};

export interface SpeechVoiceOption {
  id: string;
  label: string;
  lang: string;
}

export interface LanguageOption {
  lang: string;
  label: string;
  voiceCount: number;
}

export interface SpeechProgress {
  currentWordIndex: number;
  totalWords: number;
  percentage: number;
}

export interface UseSpeechSynthesisResult {
  isPlaying: boolean;
  isPaused: boolean;
  isSpeaking: boolean;
  play: (nextText?: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  rate: number;
  setRate: (nextRate: number) => void;
  pitch: number;
  setPitch: (nextPitch: number) => void;
  volume: number;
  setVolume: (nextVolume: number) => void;
  progress: SpeechProgress;
  isSupported: boolean;
  isReady: boolean;
  error: string | null;
  currentWordIndex: number;
  isLoading: boolean;
  availableVoices: SpeechSynthesisVoice[];
  selectedVoiceIndex: number;
  setSelectedVoice: (index: number) => void;
  playbackRate: number;
  setPlaybackRate: (nextRate: number) => void;
  voices: SpeechVoiceOption[];
  selectedVoiceId: string;
  setSelectedVoiceId: (id: string) => void;
  selectedLanguage: string;
  setSelectedLanguage: (lang: string) => void;
  languageOptions: LanguageOption[];
}

const SPEED_MIN = 0.5;
const SPEED_MAX = 2;

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
};

const clampRate = (nextRate: number): number => clamp(nextRate, SPEED_MIN, SPEED_MAX);

const hasSpeechSupport = (): boolean =>
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  "SpeechSynthesisUtterance" in window;

const getVoiceId = (voice: SpeechSynthesisVoice): string =>
  voice.voiceURI || `${voice.name}-${voice.lang}`;

const filterVoicesByGender = (
  browserVoices: SpeechSynthesisVoice[],
  gender?: "female" | "male",
): SpeechSynthesisVoice[] => {
  if (!gender) {
    return browserVoices;
  }

  const femalePattern =
    /female|woman|samantha|zira|victoria|karen|moira|tessa|fiona|veena|lekha|susan|linda|heather|serena|aria/i;
  const malePattern =
    /male|man|daniel|david|alex|fred|tom|rishi|mark|james|george|richard|guy|ryan|brian/i;

  const pattern = gender === "female" ? femalePattern : malePattern;
  const filtered = browserVoices.filter((voice) => pattern.test(voice.name));

  return filtered.length > 0 ? filtered : browserVoices;
};

const toVoiceOptions = (browserVoices: SpeechSynthesisVoice[]): SpeechVoiceOption[] =>
  browserVoices.map((voice) => ({
    id: getVoiceId(voice),
    label: voice.name,
    lang: voice.lang,
  }));

const getLanguageLabel = (lang: string): string => {
  try {
    const display = new Intl.DisplayNames([window.navigator.language || "en"], {
      type: "language",
    });
    return display.of(lang.split("-")[0]) ?? lang;
  } catch {
    return lang;
  }
};

const buildWordRanges = (inputText: string): WordRange[] => {
  if (!inputText.trim()) {
    return [];
  }

  const ranges: WordRange[] = [];
  const wordPattern = /\S+/g;

  for (const match of inputText.matchAll(wordPattern)) {
    const start = match.index ?? 0;
    ranges.push({
      start,
      end: start + match[0].length,
    });
  }

  return ranges;
};

const getWordIndexAtCharIndex = (charIndex: number, ranges: WordRange[]): number => {
  if (ranges.length === 0) {
    return 0;
  }

  const matchIndex = ranges.findIndex(
    (range) => charIndex >= range.start && charIndex <= range.end,
  );

  if (matchIndex >= 0) {
    return matchIndex;
  }

  const fallbackIndex = ranges.findIndex((range) => charIndex < range.start);
  return fallbackIndex >= 0 ? Math.max(0, fallbackIndex - 1) : ranges.length - 1;
};

export const useSpeechSynthesis = (
  text = "",
  voiceGender?: "female" | "male",
): UseSpeechSynthesisResult => {
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const textRef = useRef(text);
  const wordRangesRef = useRef<WordRange[]>(buildWordRanges(text));

  const [isSupported, setIsSupported] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRateState] = useState(1);
  const [pitch, setPitchState] = useState(1);
  const [volume, setVolumeState] = useState(1);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(0);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");

  const voices = useMemo(
    () => toVoiceOptions(filterVoicesByGender(availableVoices, voiceGender)),
    [availableVoices, voiceGender],
  );

  const languageOptions = useMemo<LanguageOption[]>(() => {
    const counts = new Map<string, number>();

    for (const voice of voices) {
      counts.set(voice.lang, (counts.get(voice.lang) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([lang, voiceCount]) => ({
        lang,
        label: getLanguageLabel(lang),
        voiceCount,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [voices]);

  const resolveBrowserVoice = useCallback(
    (voiceId: string): SpeechSynthesisVoice | undefined => {
      const genderFiltered = filterVoicesByGender(availableVoices, voiceGender);
      return genderFiltered.find((voice) => getVoiceId(voice) === voiceId);
    },
    [availableVoices, voiceGender],
  );

  const stop = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }

    utteranceRef.current = null;
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentWordIndex(0);
  }, []);

  useEffect(() => {
    textRef.current = text;
    wordRangesRef.current = buildWordRanges(text);

    if (isSpeaking || isPaused) {
      stop();
    }
  }, [isPaused, isSpeaking, stop, text]);

  useEffect(() => {
    if (!hasSpeechSupport()) {
      setIsSupported(false);
      setIsReady(false);
      setError("Text-to-speech is not supported in this browser.");
      return;
    }

    const speechSynthesis = window.speechSynthesis;
    synthRef.current = speechSynthesis;
    setIsSupported(true);

    const syncVoices = () => {
      const loadedVoices = speechSynthesis.getVoices();
      setAvailableVoices(loadedVoices);
      setIsReady(loadedVoices.length > 0);
    };

    syncVoices();
    speechSynthesis.addEventListener("voiceschanged", syncVoices);

    return () => {
      speechSynthesis.removeEventListener("voiceschanged", syncVoices);
      speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (voices.length === 0) {
      setSelectedVoiceId("");
      return;
    }

    const selectedVoiceStillExists = voices.some((voice) => voice.id === selectedVoiceId);
    if (!selectedVoiceStillExists) {
      setSelectedVoiceId(voices[0].id);
    }
  }, [selectedVoiceId, voices]);

  useEffect(() => {
    if (languageOptions.length === 0) {
      return;
    }

    const selectedLanguageStillExists = languageOptions.some(
      (option) => option.lang === selectedLanguage,
    );
    if (!selectedLanguageStillExists) {
      setSelectedLanguage(languageOptions[0].lang);
    }
  }, [languageOptions, selectedLanguage]);

  useEffect(() => {
    if (selectedVoiceIndex >= availableVoices.length) {
      setSelectedVoiceIndex(0);
    }
  }, [availableVoices.length, selectedVoiceIndex]);

  const play = useCallback(
    (nextText?: string) => {
      const textToSpeak = (nextText ?? textRef.current).trim();

      if (!synthRef.current || !isSupported) {
        setError("Text-to-speech is not supported in this browser.");
        return;
      }

      if (!textToSpeak) {
        setError("No text to speak.");
        return;
      }

      synthRef.current.cancel();
      setError(null);
      setCurrentWordIndex(0);
      setIsPaused(false);
      setIsSpeaking(false);

      textRef.current = textToSpeak;
      wordRangesRef.current = buildWordRanges(textToSpeak);

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;
      utterance.lang = selectedLanguage;

      const selectedVoice =
        resolveBrowserVoice(selectedVoiceId) ?? availableVoices[selectedVoiceIndex];
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
      };

      utterance.onresume = () => {
        setIsSpeaking(true);
        setIsPaused(false);
      };

      utterance.onpause = () => {
        setIsPaused(true);
      };

      utterance.onboundary = (event) => {
        if (event.name !== "word") {
          return;
        }

        setCurrentWordIndex(
          getWordIndexAtCharIndex(event.charIndex, wordRangesRef.current),
        );
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentWordIndex(
          wordRangesRef.current.length > 0 ? wordRangesRef.current.length - 1 : 0,
        );
        utteranceRef.current = null;
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        setError("Unable to play narration. Please try again.");
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      synthRef.current.speak(utterance);
    },
    [
      availableVoices,
      isSupported,
      pitch,
      rate,
      resolveBrowserVoice,
      selectedLanguage,
      selectedVoiceId,
      selectedVoiceIndex,
      volume,
    ],
  );

  const pause = useCallback(() => {
    if (synthRef.current && isSpeaking && !isPaused) {
      synthRef.current.pause();
    }
  }, [isPaused, isSpeaking]);

  const resume = useCallback(() => {
    if (synthRef.current && isPaused) {
      synthRef.current.resume();
    }
  }, [isPaused]);

  const setRate = useCallback((nextRate: number) => {
    const clampedRate = clampRate(nextRate);
    setRateState(clampedRate);

    if (utteranceRef.current) {
      utteranceRef.current.rate = clampedRate;
    }
  }, []);

  const setPitch = useCallback((nextPitch: number) => {
    const clampedPitch = clamp(nextPitch, 0, 2);
    setPitchState(clampedPitch);

    if (utteranceRef.current) {
      utteranceRef.current.pitch = clampedPitch;
    }
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    const clampedVolume = clamp(nextVolume, 0, 1);
    setVolumeState(clampedVolume);

    if (utteranceRef.current) {
      utteranceRef.current.volume = clampedVolume;
    }
  }, []);

  const setPlaybackRate = useCallback((nextRate: number) => {
    setRate(nextRate);
  }, [setRate]);

  const progress = useMemo<SpeechProgress>(() => {
    const totalWords = wordRangesRef.current.length;

    if (totalWords === 0) {
      return {
        currentWordIndex: 0,
        totalWords: 0,
        percentage: 0,
      };
    }

    const boundedCurrentWordIndex = Math.min(
      Math.max(currentWordIndex, 0),
      totalWords - 1,
    );

    return {
      currentWordIndex: boundedCurrentWordIndex,
      totalWords,
      percentage: Math.min(1, (boundedCurrentWordIndex + 1) / totalWords),
    };
  }, [currentWordIndex]);

  return {
    isPlaying: isSpeaking && !isPaused,
    isPaused,
    isSpeaking,
    play,
    pause,
    resume,
    stop,
    rate,
    setRate,
    pitch,
    setPitch,
    volume,
    setVolume,
    progress,
    isSupported,
    isReady,
    error,
    currentWordIndex,
    isLoading: isSupported && !isReady,
    availableVoices,
    selectedVoiceIndex,
    setSelectedVoice: setSelectedVoiceIndex,
    playbackRate: rate,
    setPlaybackRate,
    voices,
    selectedVoiceId,
    setSelectedVoiceId,
    selectedLanguage,
    setSelectedLanguage,
    languageOptions,
  };
};

export default useSpeechSynthesis;
