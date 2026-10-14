// Audio Engine: Speech Recognition + MediaRecorder + Realtime Audio Frequency Analyzer

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export class VoiceRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private speechRecognizer: SpeechRecognitionInstance | null = null;
  private startTime: number = 0;

  public isRecording = false;
  public isSpeechSupported = false;

  constructor() {
    this.isSpeechSupported =
      typeof window !== 'undefined' &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  // Start recording audio and live offline transcription
  public async startRecording(callbacks: {
    onTranscriptUpdate: (text: string, isInterim: boolean) => void;
    onError: (err: string) => void;
  }): Promise<void> {
    try {
      this.audioChunks = [];
      this.startTime = Date.now();

      // Request microphone stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Setup Web Audio Analyser for live visualizer
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioCtx();
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;
        source.connect(this.analyser);
      } catch (e) {
        console.warn('AudioContext not available for visualizer', e);
      }

      // Setup MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm';

      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      this.mediaRecorder.start(250); // collect chunks every 250ms

      this.isRecording = true;

      // Setup Offline Speech Recognition
      if (this.isSpeechSupported) {
        let accumulatedFinal = '';
        let isTerminalError = false;
        const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;

        const initRecognizer = () => {
          if (!this.isRecording || isTerminalError) return;
          try {
            if (this.speechRecognizer) {
              try {
                this.speechRecognizer.abort();
              } catch {
                // ignore
              }
              this.speechRecognizer = null;
            }

            const recognizer = new SpeechClass();
            recognizer.continuous = true;
            recognizer.interimResults = true;
            recognizer.maxAlternatives = 1;
            recognizer.lang = navigator.language || 'en-US';

            recognizer.onresult = (event: any) => {
              let interimTranscript = '';
              for (let i = event.resultIndex; i < event.results.length; ++i) {
                const item = event.results[i];
                if (item && item[0]) {
                  const transcript = item[0].transcript;
                  if (item.isFinal) {
                    accumulatedFinal += transcript + ' ';
                  } else {
                    interimTranscript += transcript;
                  }
                }
              }

              const combined = (accumulatedFinal + ' ' + interimTranscript).trim();
              if (combined) {
                callbacks.onTranscriptUpdate(combined, interimTranscript.length > 0);
              }
            };

            recognizer.onerror = (event: any) => {
              if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                isTerminalError = true;
                console.warn('Speech recognition permission denied in this browser context');
              } else if (event.error === 'network') {
                isTerminalError = true;
                console.warn('Browser speech recognition network service unavailable');
              } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
                console.warn('Speech recognition status:', event.error);
              }
            };

            recognizer.onend = () => {
              if (this.isRecording && !isTerminalError) {
                setTimeout(() => {
                  if (this.isRecording && !isTerminalError) {
                    initRecognizer();
                  }
                }, 200);
              }
            };

            this.speechRecognizer = recognizer;
            recognizer.start();
          } catch (e) {
            console.warn('Speech recognition initialization warning:', e);
          }
        };

        initRecognizer();
      }
    } catch (err: any) {
      this.cleanup();
      callbacks.onError(err.message || 'Microphone access denied or unavailable');
      throw err;
    }
  }

  // Get current audio volume level (0 to 1) for waveform animations
  public getAudioFrequencyData(): Uint8Array {
    if (!this.analyser) {
      return new Uint8Array(16);
    }
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  // Stop recording and return complete Audio Blob & elapsed duration
  public async stopRecording(): Promise<{ audioBlob: Blob; duration: number }> {
    return new Promise((resolve) => {
      const duration = (Date.now() - this.startTime) / 1000;

      if (this.speechRecognizer) {
        try {
          this.speechRecognizer.stop();
        } catch {
          // ignore
        }
      }

      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.onstop = () => {
          const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          this.cleanup();
          resolve({ audioBlob, duration });
        };
        this.mediaRecorder.stop();
      } else {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.cleanup();
        resolve({ audioBlob, duration });
      }
    });
  }

  public cancelRecording(): void {
    if (this.speechRecognizer) {
      try {
        this.speechRecognizer.abort();
      } catch {
        // ignore
      }
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.isRecording = false;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;
    this.speechRecognizer = null;
    this.audioChunks = [];
  }
}

export const voiceRecorder = new VoiceRecorderService();

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
