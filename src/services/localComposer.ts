import { Scale, Chord, Note } from "tonal";
import * as scribble from "scribbletune";

export interface Composition {
  title: string;
  description: string;
  bpm: number;
  segments: Segment[];
}

export type InstrumentType = 
  | "piano" | "drums" | "bass" | "strings" | "guitar" 
  | "violin" | "cello" | "organ" | "flute" | "clarinet" 
  | "saxophone" | "trumpet" | "trombone" | "tuba" | "harp" 
  | "marimba" | "xylophone" | "vibraphone" | "celesta" | "accordion" 
  | "harmonica" | "banjo" | "mandolin" | "ukulele" | "sitar" 
  | "koto" | "shamisen" | "bagpipes" | "oboe" | "bassoon" 
  | "piccolo" | "english_horn" | "contrabass" | "viola" 
  | "synth_lead" | "synth_pad" | "synth_bass" | "electric_piano" | "clavinet";

export interface Segment {
  title: string;
  mood: string;
  synthType: InstrumentType;
  duration: number;
  notes: { note: string; time: string; duration: string }[];
  vocalNotes: { note: string; time: string; duration: string }[];
  lyrics: string;
}

const MOOD_SCALES: Record<string, string> = {
  happy: "major",
  sad: "minor",
  energetic: "lydian",
  calm: "dorian",
  dark: "phrygian",
  mysterious: "locrian",
  heroic: "mixolydian",
};

const INSTRUMENT_TYPES: InstrumentType[] = [
  "piano", "drums", "bass", "strings", "guitar", 
  "violin", "cello", "organ", "flute", "clarinet", 
  "saxophone", "trumpet", "trombone", "tuba", "harp", 
  "marimba", "xylophone", "vibraphone", "celesta", "accordion", 
  "harmonica", "banjo", "mandolin", "ukulele", "sitar", 
  "koto", "shamisen", "bagpipes", "oboe", "bassoon", 
  "piccolo", "english_horn", "contrabass", "viola", 
  "synth_lead", "synth_pad", "synth_bass", "electric_piano", "clavinet"
];

export const generateLocalComposition = (prompt: string, lyrics: string): Composition => {
  const mood = prompt.toLowerCase().includes("sad") ? "sad" : 
               prompt.toLowerCase().includes("energetic") ? "energetic" : 
               prompt.toLowerCase().includes("dark") ? "dark" : "happy";
  
  const scaleName = MOOD_SCALES[mood] || "major";
  const root = "C";
  const scale = Scale.get(`${root}4 ${scaleName}`).notes;
  const bpm = mood === "sad" ? 70 : mood === "energetic" ? 128 : 100;

  // Split lyrics by sections like [Verse], [Chorus]
  const sections = lyrics.split(/\[(.*?)\]/).filter(s => s.trim().length > 0);
  const segments: Segment[] = [];

  for (let i = 0; i < sections.length; i += 2) {
    const sectionTitle = sections[i] || `Section ${segments.length + 1}`;
    const sectionLyrics = sections[i + 1] || "";
    
    // Generate notes using Scribbletune-like patterns
    const pattern = "x-x-x-x-x-x-x-x-"; // 8 notes per measure, 2 measures = 16 notes
    const synthType = INSTRUMENT_TYPES[Math.floor(Math.random() * INSTRUMENT_TYPES.length)];
    
    const notes: { note: string; time: string; duration: string }[] = [];
    const vocalNotes: { note: string; time: string; duration: string }[] = [];

    // Simple algorithmic melody generation
    for (let j = 0; j < 16; j++) {
      const time = `0:${Math.floor(j / 4)}:${j % 4}`;
      const noteIndex = Math.floor(Math.random() * scale.length);
      const note = scale[noteIndex];
      
      // Primary instrument notes
      notes.push({
        note: `${note}${Math.random() > 0.5 ? 3 : 4}`,
        time,
        duration: "8n"
      });

      // Vocal melody (often simpler, higher register)
      if (j % 2 === 0) {
        vocalNotes.push({
          note: `${scale[(noteIndex + 2) % scale.length]}5`,
          time,
          duration: "4n"
        });
      }
    }

    segments.push({
      title: sectionTitle,
      mood,
      synthType,
      duration: 4,
      notes,
      vocalNotes,
      lyrics: sectionLyrics.trim()
    });
  }

  // If no sections found, create a default one
  if (segments.length === 0) {
    segments.push({
      title: "Main Theme",
      mood,
      synthType: "piano",
      duration: 4,
      notes: scale.map((n, i) => ({ note: `${n}4`, time: `0:0:${i}`, duration: "4n" })),
      vocalNotes: scale.map((n, i) => ({ note: `${n}5`, time: `0:0:${i}`, duration: "4n" })),
      lyrics: lyrics || "No lyrics provided"
    });
  }

  return {
    title: `Algorithmic ${mood.charAt(0).toUpperCase() + mood.slice(1)} Piece`,
    description: `A purely algorithmic composition in ${root} ${scaleName} scale.`,
    bpm,
    segments
  };
};
