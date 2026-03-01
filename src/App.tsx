import React, { useState, useEffect, useRef } from "react";
import { 
  Music, 
  Play, 
  Pause, 
  Plus, 
  Trash2, 
  Download, 
  Loader2, 
  Settings, 
  Mic2, 
  Layers, 
  ChevronRight, 
  Save,
  Wand2,
  Volume2,
  ListMusic,
  FileAudio,
  Square,
  CircleStop,
  Zap,
  Activity,
  FileText
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import * as Tone from "tone";
import Soundfont from "soundfont-player";
import Meyda from "meyda";
import * as mm from "@magenta/music";
import { generateLocalComposition, InstrumentType } from "./services/localComposer";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Initialize Magenta Models
const musicRnn = new mm.MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn');
const musicVae = new mm.MusicVAE('https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_2bar_small');

interface Note {
  note: string;
  time: string;
  duration: string;
}

interface Segment {
  title: string;
  mood: string;
  synthType: InstrumentType;
  notes: Note[];
  vocalNotes: Note[];
  lyrics: string;
  duration: number;
  isSynthesized?: boolean;
}

interface Composition {
  title: string;
  description: string;
  bpm: number;
  segments: Segment[];
}

const SpectralAnalyzer = ({ isPlaying }: { isPlaying: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzerRef = useRef<any>(null);

  useEffect(() => {
    if (!isPlaying) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      const audioContext = Tone.context.rawContext as AudioContext;
      
      if (!audioContext || typeof audioContext.createScriptProcessor !== "function") {
        console.warn("Meyda: createScriptProcessor is not supported in this environment.");
        return;
      }

      // Use the native output node of Tone.Destination
      const source = (Tone.getDestination() as any).output;

      analyzerRef.current = Meyda.createMeydaAnalyzer({
        audioContext: audioContext,
        source: source,
        bufferSize: 512,
        featureExtractors: ["spectralCentroid", "spectralRolloff", "amplitudeSpectrum"],
        callback: (features) => {
          const spectrum = features.amplitudeSpectrum;
          if (!spectrum) return;

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const barWidth = canvas.width / spectrum.length;
          
          for (let i = 0; i < spectrum.length; i++) {
            const value = spectrum[i];
            const percent = value * 255;
            const height = (percent / 255) * canvas.height;
            
            ctx.fillStyle = `rgba(242, 125, 38, ${0.3 + (value * 0.7)})`;
            ctx.fillRect(i * barWidth, canvas.height - height, barWidth - 1, height);
          }
        },
      });

      analyzerRef.current.start();
    } catch (err) {
      console.error("Meyda Initialization Error:", err);
    }

    return () => {
      if (analyzerRef.current) {
        try {
          analyzerRef.current.stop();
        } catch (e) {}
      }
    };
  }, [isPlaying]);

  return (
    <div className="w-full h-16 bg-[#0A0A0B] rounded-lg border border-[#2C2C2F] overflow-hidden relative">
      <canvas ref={canvasRef} width={400} height={64} className="w-full h-full opacity-50" />
      <div className="absolute top-2 left-2 flex items-center gap-1">
        <Activity className="w-3 h-3 text-[#F27D26]" />
        <span className="text-[8px] font-mono text-[#5E5E62] uppercase tracking-widest">Spectral Analysis</span>
      </div>
    </div>
  );
};

const WaveformVisualizer = ({ isPlaying }: { isPlaying: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformRef = useRef<Tone.Waveform | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    waveformRef.current = new Tone.Waveform(1024);
    Tone.Destination.connect(waveformRef.current);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      const values = waveformRef.current?.getValue();
      if (!values) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.lineJoin = "round";
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#F27D26";

      const bufferLength = values.length;
      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = values[i] as number;
        const y = (v + 1) * (canvas.height / 2);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      waveformRef.current?.dispose();
    };
  }, []);

  return (
    <div className="w-full h-24 bg-[#0A0A0B] rounded-xl border border-[#2C2C2F] overflow-hidden relative">
      <canvas ref={canvasRef} width={800} height={100} className="w-full h-full" />
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
          <span className="text-[10px] font-mono text-[#5E5E62] uppercase tracking-widest">Signal Offline</span>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [lyricsStructure, setLyricsStructure] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [liveNotes, setLiveNotes] = useState<string[]>([]);
  const [composition, setComposition] = useState<Composition | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

  const recorderRef = useRef<Tone.Recorder | null>(null);
  const previewSynthRef = useRef<Tone.Synth | null>(null);
  const samplersRef = useRef<Map<string, Tone.Sampler>>(new Map());
  const synthsRef = useRef<Map<number, any>>(new Map());
  const vocalSynthsRef = useRef<Map<number, Tone.PolySynth>>(new Map());
  const effectsRef = useRef<{
    reverb: Tone.Reverb;
    delay: Tone.FeedbackDelay;
    filter: Tone.Filter;
    chorus: Tone.Chorus;
  } | null>(null);

  useEffect(() => {
    // Setup Global Mastering Chain
    const limiter = new Tone.Limiter(-1).toDestination();
    const compressor = new Tone.Compressor({
      threshold: -24,
      ratio: 4,
      attack: 0.003,
      release: 0.25
    }).connect(limiter);
    
    const masterReverb = new Tone.Reverb({ decay: 4, wet: 0.2 }).connect(compressor);
    const masterDelay = new Tone.FeedbackDelay("8n", 0.3).connect(masterReverb);
    const masterFilter = new Tone.Filter(20000, "lowpass").connect(masterDelay);
    
    effectsRef.current = { 
      reverb: masterReverb, 
      delay: masterDelay, 
      filter: masterFilter, 
      chorus: new Tone.Chorus(4, 2.5, 0.5).connect(masterFilter) 
    };

    // Pre-load common high-quality samplers
    const loadSamplers = async () => {
      const baseUrl = "https://tonejs.github.io/audio/";
      
      const instruments = [
        { name: "piano", path: "salamander/", urls: { A1: "A1.mp3", A2: "A2.mp3", A3: "A3.mp3", A4: "A4.mp3" } },
        { name: "bass", path: "casio/", urls: { A1: "A1.mp3", A2: "A2.mp3" } },
        { name: "guitar", path: "guitar-acoustic/", urls: { A2: "A2.mp3", C3: "C3.mp3", E3: "E3.mp3", G3: "G3.mp3" } },
        { name: "drums", path: "drum-samples/CR78/", urls: { C1: "kick.mp3", D1: "snare.mp3", E1: "hihat.mp3", F1: "tom1.mp3" } },
        { name: "violin", path: "violin/", urls: { A3: "A3.mp3", A4: "A4.mp3", A5: "A5.mp3", A6: "A6.mp3" } },
        { name: "cello", path: "cello/", urls: { A2: "A2.mp3", A3: "A3.mp3", A4: "A4.mp3" } },
        { name: "organ", path: "organ/", urls: { C3: "C3.mp3", C4: "C4.mp3", C5: "C5.mp3", C6: "C6.mp3" } },
        { name: "flute", path: "flute/", urls: { A4: "A4.mp3", C5: "C5.mp3", E5: "E5.mp3", G5: "G5.mp3" } },
        { name: "trumpet", path: "trumpet/", urls: { A3: "A3.mp3", C4: "C4.mp3", E4: "E4.mp3", G4: "G4.mp3" } },
        { name: "harp", path: "harp/", urls: { C3: "C3.mp3", G3: "G3.mp3", C4: "C4.mp3", G4: "G4.mp3" } },
        { name: "marimba", path: "marimba/", urls: { C3: "C3.mp3", G3: "G3.mp3", C4: "C4.mp3", G4: "G4.mp3" } },
        { name: "xylophone", path: "xylophone/", urls: { C3: "C3.mp3", G3: "G3.mp3", C4: "C4.mp3", G4: "G4.mp3" } },
        { name: "vibraphone", path: "vibraphone/", urls: { C3: "C3.mp3", G3: "G3.mp3", C4: "C4.mp3", G4: "G4.mp3" } },
        { name: "clarinet", path: "clarinet/", urls: { D3: "D3.mp3", F3: "F3.mp3", A3: "A3.mp3", C4: "C4.mp3" } },
        { name: "trombone", path: "trombone/", urls: { C3: "C3.mp3", E3: "E3.mp3", G3: "G3.mp3", C4: "C4.mp3" } },
        { name: "tuba", path: "tuba/", urls: { A1: "A1.mp3", C2: "C2.mp3", E2: "E2.mp3", G2: "G2.mp3" } },
        { name: "saxophone", path: "sax/", urls: { D3: "D3.mp3", F3: "F3.mp3", A3: "A3.mp3", C4: "C4.mp3" } },
        { name: "contrabass", path: "contrabass/", urls: { C2: "C2.mp3", G2: "G2.mp3", C3: "C3.mp3" } },
        { name: "viola", path: "viola/", urls: { C3: "C3.mp3", G3: "G3.mp3", C4: "C4.mp3", G4: "G4.mp3" } },
        { name: "piccolo", path: "flute/", urls: { A5: "A5.mp3", C6: "C6.mp3" } }, // Fallback to flute samples
        { name: "oboe", path: "flute/", urls: { A4: "A4.mp3", C5: "C5.mp3" } }, // Fallback
        { name: "bassoon", path: "cello/", urls: { A2: "A2.mp3", A3: "A3.mp3" } }, // Fallback
        { name: "harmonica", path: "harmonium/", urls: { C3: "C3.mp3", G3: "G3.mp3" } }, // Fallback
        { name: "banjo", path: "guitar-acoustic/", urls: { A2: "A2.mp3", C3: "C3.mp3" } }, // Fallback
        { name: "ukulele", path: "guitar-acoustic/", urls: { A3: "A3.mp3", C4: "C4.mp3" } }, // Fallback
        { name: "celesta", path: "marimba/", urls: { C4: "C4.mp3", G4: "G4.mp3" } }, // Fallback
        { name: "accordion", path: "organ/", urls: { C3: "C3.mp3", G3: "G3.mp3" } }, // Fallback
        { name: "mandolin", path: "guitar-acoustic/", urls: { A3: "A3.mp3", C4: "C4.mp3" } }, // Fallback
        { name: "sitar", path: "guitar-acoustic/", urls: { A2: "A2.mp3", C3: "C3.mp3" } }, // Fallback
        { name: "koto", path: "harp/", urls: { C3: "C3.mp3", G3: "G3.mp3" } }, // Fallback
        { name: "shamisen", path: "guitar-acoustic/", urls: { A2: "A2.mp3", C3: "C3.mp3" } }, // Fallback
        { name: "bagpipes", path: "flute/", urls: { A4: "A4.mp3", C5: "C5.mp3" } }, // Fallback
        { name: "english_horn", path: "flute/", urls: { A4: "A4.mp3", C5: "C5.mp3" } }, // Fallback
        { name: "synth_lead", path: "casio/", urls: { A1: "A1.mp3", A2: "A2.mp3" } }, // Fallback
        { name: "synth_pad", path: "organ/", urls: { C3: "C3.mp3", C4: "C4.mp3" } }, // Fallback
        { name: "synth_bass", path: "casio/", urls: { A1: "A1.mp3", A2: "A2.mp3" } }, // Fallback
        { name: "electric_piano", path: "salamander/", urls: { A1: "A1.mp3", A2: "A2.mp3" } }, // Fallback
        { name: "clavinet", path: "casio/", urls: { A1: "A1.mp3", A2: "A2.mp3" } }, // Fallback
      ];

      for (const inst of instruments) {
        const sampler = new Tone.Sampler({
          urls: inst.urls,
          baseUrl: baseUrl + inst.path,
          onload: () => console.log(`${inst.name} Loaded`)
        }).connect(masterFilter);
        samplersRef.current.set(inst.name, sampler);
      }
    };
    loadSamplers();

    recorderRef.current = new Tone.Recorder();
    Tone.Destination.connect(recorderRef.current);
    
    // Setup Preview Synth
    previewSynthRef.current = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 }
    }).toDestination();
    
    return () => {
      synthsRef.current.forEach(s => s.dispose());
      vocalSynthsRef.current.forEach(s => s.dispose());
      samplersRef.current.forEach(s => s.dispose());
      previewSynthRef.current?.dispose();
      limiter.dispose();
      compressor.dispose();
      masterReverb.dispose();
      masterDelay.dispose();
      masterFilter.dispose();
      Tone.Transport.stop();
      Tone.Transport.cancel();
    };
  }, []);

  const addSegmentToTransport = async (segment: Segment, idx: number, bpm: number) => {
    const masterFilter = effectsRef.current?.filter;
    
    // Humanizer Function: Adds tiny random offsets to time and velocity
    const humanize = (time: any) => {
      const offset = (Math.random() - 0.5) * 0.02; // 20ms max jitter
      return Tone.Time(time).toSeconds() + offset;
    };

    // 1. Setup Primary Synth/Sampler
    let synth: any;
    try {
      const type = segment.synthType.toLowerCase();
      if (samplersRef.current.has(type)) {
        synth = samplersRef.current.get(type);
      } else if (type === "synth_lead" || type === "saxophone" || type === "trumpet" || type === "synth_bass") {
        // Lead approximation
        synth = new Tone.MonoSynth({
          oscillator: { type: "sawtooth" },
          envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.8 }
        }).connect(effectsRef.current!.filter);
      } else if (type === "synth_pad" || type === "strings" || type === "organ" || type === "choir") {
        // Pad/Organ/Strings approximation
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "sine" },
          envelope: { attack: 1.5, decay: 0.5, sustain: 1, release: 3 }
        }).connect(effectsRef.current!.filter);
      } else {
        // Generic fallback
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 1 }
        }).connect(effectsRef.current!.filter);
      }
    } catch (err) {
      synth = new Tone.PolySynth(Tone.Synth).connect(effectsRef.current!.filter);
    }
    synthsRef.current.set(idx, synth);

    // 2. Setup Vocal Synth
    const vocalSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.4, decay: 0.2, sustain: 0.8, release: 1.5 }
    }).connect(effectsRef.current!.chorus);
    vocalSynthsRef.current.set(idx, vocalSynth);

    // 3. Schedule Primary Notes with Humanization
    new Tone.Part((time, value) => {
      try {
        const hTime = humanize(time);
        const velocity = 0.7 + Math.random() * 0.3; // Random velocity for organic feel
        synth.triggerAttackRelease(value.note, value.duration, hTime, velocity);
        
        if (segment.title.toLowerCase().includes("chorus") && masterFilter) {
          masterFilter.frequency.rampTo(5000, 2, time);
        } else if (masterFilter) {
          masterFilter.frequency.rampTo(1200, 2, time);
        }
        Tone.Draw.schedule(() => setActiveSegmentIndex(idx), time);
      } catch (e) {}
    }, segment.notes).start(`${idx * 4}m`);

    // 4. Schedule Vocal Notes with Humanization
    if (segment.vocalNotes) {
      new Tone.Part((time, value) => {
        try {
          const hTime = humanize(time);
          vocalSynth.triggerAttackRelease(value.note, value.duration, hTime, 0.8);
        } catch (e) {}
      }, segment.vocalNotes).start(`${idx * 4}m`);
    }
  };

  const handleCompose = async () => {
    if (!prompt && !lyricsStructure) return;
    
    setIsComposing(true);
    setError(null);
    setComposition(null);
    Tone.Transport.stop();
    Tone.Transport.cancel();
    
    try {
      // 1. Generate basic structure using local composer
      const localComp = generateLocalComposition(prompt, lyricsStructure);
      
      // 2. Initialize Magenta models
      if (!musicRnn.isInitialized()) await musicRnn.initialize();
      
      // 3. Enhance melodies using Magenta MusicRNN
      for (const segment of localComp.segments) {
        // Convert local notes to Magenta NoteSequence
        const inputSeq: mm.INoteSequence = {
          notes: segment.notes.map((n, i) => ({
            pitch: Tone.Frequency(n.note).toMidi(),
            startTime: i * 0.5,
            endTime: (i + 1) * 0.5
          })),
          totalTime: segment.notes.length * 0.5
        };

        // Generate a continuation
        const continuation = await musicRnn.continueSequence(inputSeq, 16, 1.0);
        
        // Map back to our format if continuation was successful
        if (continuation && continuation.notes && continuation.notes.length > 0) {
          segment.notes = continuation.notes.map((n, i) => ({
            note: Tone.Frequency(n.pitch!, "midi").toNote(),
            time: `0:${Math.floor(i / 4)}:${i % 4}`,
            duration: "8n"
          }));
        }
      }

      setComposition(localComp);
      Tone.Transport.bpm.value = localComp.bpm;
      
      // Add all segments to transport
      for (let i = 0; i < localComp.segments.length; i++) {
        await addSegmentToTransport(localComp.segments[i], i, localComp.bpm);
      }
      
      if (Tone.getContext().state !== "running") await Tone.start();
      Tone.Transport.start();
      setIsPlaying(true);
    } catch (err: any) {
      setError("Magenta engine failed: " + err.message);
    } finally {
      setIsComposing(false);
    }
  };

  const togglePlay = async () => {
    if (Tone.getContext().state !== "running") {
      await Tone.start();
      console.log("Audio Context Started");
    }
    
    if (isPlaying) {
      Tone.Transport.pause();
    } else {
      Tone.Transport.start();
    }
    setIsPlaying(!isPlaying);
  };

  const playTestSound = async () => {
    if (Tone.getContext().state !== "running") await Tone.start();
    const synth = new Tone.Synth().toDestination();
    synth.triggerAttackRelease("C4", "8n");
    setTimeout(() => synth.dispose(), 1000);
  };

  const startRecording = async () => {
    if (!composition) return;
    if (Tone.getContext().state !== "running") await Tone.start();
    setIsRecording(true);
    recorderRef.current?.start();
    Tone.Transport.stop();
    Tone.Transport.start();
    setIsPlaying(true);
    Tone.Transport.scheduleOnce(async () => {
      const recording = await recorderRef.current?.stop();
      if (recording) {
        const url = URL.createObjectURL(recording);
        const anchor = document.createElement("a");
        anchor.download = `${composition.title.replace(/\s+/g, '_')}.webm`;
        anchor.href = url;
        anchor.click();
      }
      setIsRecording(false);
      setIsPlaying(false);
      Tone.Transport.stop();
    }, `${composition.segments.length * 4}m`);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#E1E1E6] font-sans selection:bg-[#F27D26]/30">
      {/* Header */}
      <header className="border-b border-[#1C1C1F] bg-[#0A0A0B]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F27D26] rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(242,125,38,0.3)]">
              <Zap className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">MuseSynth Pro</h1>
              <p className="text-[10px] text-[#8E9299] uppercase tracking-widest font-mono">Advanced Synthesis Engine v2.5</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={playTestSound}
              className="flex items-center gap-2 px-3 py-1 bg-[#1C1C1F] rounded-full border border-[#2C2C2F] text-[10px] font-mono text-[#8E9299] hover:text-white transition-colors"
            >
              <Volume2 className="w-3 h-3" />
              TEST SOUND
            </button>
            <div className="flex items-center gap-2 px-3 py-1 bg-[#1C1C1F] rounded-full border border-[#2C2C2F]">
              <Volume2 className="w-3 h-3 text-[#8E9299]" />
              <input 
                type="range" 
                min="-60" 
                max="0" 
                defaultValue="0"
                onChange={(e) => {
                  Tone.Destination.volume.value = parseFloat(e.target.value);
                }}
                className="w-20 h-1 bg-[#2C2C2F] rounded-lg appearance-none cursor-pointer accent-[#F27D26]"
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-[#1C1C1F] rounded-full border border-[#2C2C2F]">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs font-mono text-[#8E9299]">PRO MOTOR ACTIVE</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Composer Controls */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-[#151619] border border-[#2C2C2F] rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#F27D26] to-transparent opacity-50" />
            
            <div className="flex items-center gap-2 mb-6">
              <Wand2 className="w-4 h-4 text-[#F27D26]" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-[#8E9299]">Neural Composer</h2>
            </div>

            <div className="space-y-6">
              {/* Lyrics & Structure Input */}
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-[#5E5E62] uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-3 h-3" />
                  Lyrics & Structure
                </label>
                <textarea
                  value={lyricsStructure}
                  onChange={(e) => setLyricsStructure(e.target.value)}
                  placeholder="[Intro]\n[Verse 1]\nLyrics here...\n[Chorus]\nMore lyrics..."
                  className="w-full h-40 bg-[#0A0A0B] border border-[#2C2C2F] rounded-xl p-4 text-sm focus:outline-none focus:border-[#F27D26] transition-all resize-none placeholder:text-[#3C3C3F] font-serif italic"
                />
              </div>

              {/* Style/Mood Prompt */}
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-[#5E5E62] uppercase tracking-widest flex items-center gap-2">
                  <Zap className="w-3 h-3" />
                  Style & Mood
                </label>
                <div className="relative">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the sonic atmosphere..."
                    className="w-full h-24 bg-[#0A0A0B] border border-[#2C2C2F] rounded-xl p-4 text-sm focus:outline-none focus:border-[#F27D26] transition-all resize-none placeholder:text-[#3C3C3F]"
                  />
                  <div className="absolute bottom-3 right-3">
                    <button 
                      onClick={handleCompose}
                      disabled={isComposing || isSynthesizing || (!prompt && !lyricsStructure)}
                      className="bg-[#F27D26] hover:bg-[#FF8D36] disabled:opacity-50 disabled:cursor-not-allowed text-black px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-[#F27D26]/20"
                    >
                      {isComposing || isSynthesizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
                      {isSynthesizing ? "SYNTHESIZING..." : "SYNTHESIZE SCORE"}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-[11px] font-mono">
                  ERROR: {error}
                </div>
              )}
            </div>
          </section>

          {composition && (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#151619] border border-[#2C2C2F] rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-[#F27D26]" />
                <h2 className="text-xs font-mono uppercase tracking-widest text-[#8E9299]">Score Details</h2>
              </div>
              <h3 className="text-xl font-bold mb-2">{composition.title}</h3>
              <p className="text-sm text-[#8E9299] leading-relaxed mb-6 italic">
                "{composition.description}"
              </p>

              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-mono text-[#5E5E62] uppercase tracking-tighter">
                  <span>Tempo</span>
                  <span>{composition.bpm} BPM</span>
                </div>
                <div className="flex justify-between text-[10px] font-mono text-[#5E5E62] uppercase tracking-tighter">
                  <span>Total Length</span>
                  <span>{composition.segments.length * 4} Bars</span>
                </div>
                <div className="h-[1px] bg-[#2C2C2F]" />
                
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={togglePlay}
                    className={cn(
                      "py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all",
                      isPlaying ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-[#E1E1E6] text-black hover:bg-white"
                    )}
                  >
                    {isPlaying ? <CircleStop className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {isPlaying ? "PAUSE" : "PLAY SCORE"}
                  </button>
                  
                  <button 
                    onClick={startRecording}
                    disabled={isRecording}
                    className="py-3 bg-[#1C1C1F] hover:bg-[#2C2C2F] text-[#E1E1E6] border border-[#2C2C2F] rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-30"
                  >
                    {isRecording ? <Loader2 className="w-4 h-4 animate-spin text-[#F27D26]" /> : <Download className="w-4 h-4" />}
                    {isRecording ? "RECORDING..." : "EXPORT WAV"}
                  </button>
                </div>
              </div>
            </motion.section>
          )}

          {composition && <SpectralAnalyzer isPlaying={isPlaying} />}
        </div>

        {/* Right Column: Studio Timeline */}
        <div className="lg:col-span-8">
          <div className="bg-[#151619] border border-[#2C2C2F] rounded-2xl min-h-[600px] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-[#2C2C2F] flex flex-col gap-6">
              {/* Live Synthesis Monitor */}
              {isComposing && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-6 bg-[#1C1C1F] border border-[#F27D26]/30 rounded-2xl shadow-[0_0_20px_rgba(242,125,38,0.1)]"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-[#F27D26] rounded-full animate-pulse" />
                      <h3 className="text-xs font-mono text-[#F27D26] uppercase tracking-[0.2em]">Live Synthesis Monitor</h3>
                    </div>
                    <span className="text-[10px] font-mono text-[#5E5E62] uppercase">Baking Score...</span>
                  </div>
                  <div className="h-12 flex items-end gap-1 overflow-hidden">
                    {Array.from({ length: 40 }).map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{ 
                          height: isComposing ? [10, Math.random() * 40 + 10, 10] : 10,
                          opacity: [0.3, 0.6, 0.3]
                        }}
                        transition={{ 
                          duration: 0.5 + Math.random(), 
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                        className="flex-1 bg-[#F27D26]/40 rounded-t-sm"
                      />
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex gap-2">
                      {composition?.segments.map((s, i) => (
                        <div key={i} className="w-2 h-2 rounded-full bg-[#F27D26]" />
                      ))}
                      <div className="w-2 h-2 rounded-full bg-[#2C2C2F] animate-pulse" />
                    </div>
                    <span className="text-[9px] font-mono text-[#5E5E62] uppercase">
                      {composition?.segments.length || 0} Segments Baked
                    </span>
                  </div>
                </motion.div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ListMusic className="w-5 h-5 text-[#F27D26]" />
                  <h2 className="text-sm font-bold tracking-tight">Sequencer Timeline</h2>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex gap-1">
                    {[...Array(16)].map((_, i) => (
                      <motion.div 
                        key={i}
                        animate={{ 
                          height: isPlaying ? [8, 24, 12, 20, 8] : 8,
                          backgroundColor: isPlaying ? "#F27D26" : "#2C2C2F"
                        }}
                        transition={{ 
                          repeat: Infinity, 
                          duration: 0.5, 
                          delay: i * 0.05,
                          ease: "easeInOut"
                        }}
                        className="w-1 rounded-full"
                      />
                    ))}
                  </div>
                </div>
              </div>

              {composition && <WaveformVisualizer isPlaying={isPlaying} />}
            </div>

            <div className="flex-1 p-6 space-y-4 overflow-y-auto max-h-[700px] custom-scrollbar">
              {!composition ? (
                <div className="h-full flex flex-col items-center justify-center text-[#3C3C3F] space-y-4">
                  <Mic2 className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-mono tracking-widest uppercase">Awaiting Neural Score...</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {composition.segments.map((segment, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={cn(
                        "group relative bg-[#0A0A0B] border border-[#2C2C2F] rounded-xl p-5 transition-all",
                        activeSegmentIndex === idx && "border-[#F27D26] ring-1 ring-[#F27D26]/20 shadow-[0_0_30px_rgba(242,125,38,0.05)] bg-[#F27D26]/5"
                      )}
                    >
                      <div className="flex flex-col gap-6">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono text-[#F27D26] bg-[#F27D26]/10 px-2 py-0.5 rounded border border-[#F27D26]/20">
                                {segment.synthType.toUpperCase()}
                              </span>
                              <h3 className="font-bold text-sm tracking-tight">{segment.title}</h3>
                            </div>
                            <span className="text-[10px] font-mono text-[#5E5E62]">4 BARS</span>
                          </div>
                          
                          <div className="flex items-center gap-2 text-[11px] text-[#8E9299] font-mono italic">
                            <span className="w-1 h-1 bg-[#F27D26] rounded-full" />
                            {segment.mood}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="text-[9px] font-mono text-[#5E5E62] uppercase tracking-widest">Lyrics</span>
                              <div className="p-3 bg-[#151619] rounded-lg border border-[#2C2C2F]/50 min-h-[80px]">
                                <p className="text-[11px] leading-relaxed text-[#E1E1E6] font-serif italic whitespace-pre-line">
                                  {segment.lyrics}
                                </p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <span className="text-[9px] font-mono text-[#5E5E62] uppercase tracking-widest">Vocal Line</span>
                              <div className="grid grid-cols-8 gap-1 h-20">
                                {segment.vocalNotes?.slice(0, 16).map((n, i) => (
                                  <div 
                                    key={i} 
                                    className="bg-[#1C1C1F] rounded border border-[#2C2C2F] flex items-center justify-center"
                                    title={n.note}
                                  >
                                    <div className="w-1 h-1 bg-emerald-500 rounded-full opacity-60 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <span className="text-[9px] font-mono text-[#5E5E62] uppercase tracking-widest">Instrumental</span>
                              <div className="grid grid-cols-8 gap-1 h-20">
                                {segment.notes.slice(0, 16).map((n, i) => (
                                  <div 
                                    key={i} 
                                    className="bg-[#1C1C1F] rounded border border-[#2C2C2F] flex items-center justify-center"
                                    title={n.note}
                                  >
                                    <div className="w-1 h-1 bg-[#F27D26] rounded-full opacity-40" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            <div className="p-4 bg-[#0A0A0B] border-t border-[#2C2C2F] rounded-b-2xl flex items-center justify-between">
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full", isPlaying ? "bg-[#F27D26] shadow-[0_0_8px_#F27D26]" : "bg-[#2C2C2F]")} />
                  <span className="text-[9px] font-mono text-[#5E5E62] uppercase tracking-widest">Transport Active</span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-mono text-[#5E5E62]">
                <span>{composition?.bpm || 0} BPM</span>
                <div className="h-4 w-[1px] bg-[#2C2C2F]" />
                <span>4/4 TIME</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-[#1C1C1F] mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 opacity-30 grayscale">
            <Music className="w-4 h-4" />
            <span className="text-xs font-mono tracking-tighter uppercase">MuseSynth Pro Engine v2.5.0</span>
          </div>
          <p className="text-[10px] font-mono text-[#3C3C3F] uppercase tracking-widest">
            Powered by Gemini 3.1, Tone.js, Soundfont & Meyda
          </p>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0A0A0B;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #2C2C2F;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #F27D26;
        }
      `}} />
    </div>
  );
}
