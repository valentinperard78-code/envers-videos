"""Génère la voix off de chaque texte texts/<slug>.txt -> out/<slug>.wav + out/<slug>.json (mots minutés).
Voix principale : Rémy (fr-FR-RemyMultilingualNeural, edge-tts). Secours : Piper fr_FR-tom-medium + faster-whisper pour le minutage."""
import asyncio, glob, json, os, subprocess, sys
VOICE = "fr-FR-RemyMultilingualNeural"
os.makedirs("out", exist_ok=True)
status = {}

async def edge(slug, txt):
    import edge_tts
    c = edge_tts.Communicate(txt, VOICE, boundary="WordBoundary")
    words = []
    with open(f"out/{slug}.mp3", "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append([ch["text"], ch["offset"] // 10000, (ch["offset"] + ch["duration"]) // 10000])
    if not words or os.path.getsize(f"out/{slug}.mp3") < 10000:
        raise RuntimeError("audio vide")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"out/{slug}.mp3", "-ar", "24000", "-ac", "1", f"out/{slug}.wav"], check=True)
    os.remove(f"out/{slug}.mp3")
    return words

def piper(slug, txt):
    subprocess.run("pip install -q piper-tts faster-whisper", shell=True, check=True)
    base = "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/tom/medium/fr_FR-tom-medium"
    if not os.path.exists("tom.onnx"):
        subprocess.run(f"curl -sL -o tom.onnx {base}.onnx && curl -sL -o tom.onnx.json {base}.onnx.json", shell=True, check=True)
    subprocess.run(["python", "-m", "piper", "-m", "tom.onnx", "-f", f"out/{slug}.wav"], input=txt.encode(), check=True)
    from faster_whisper import WhisperModel
    m = WhisperModel("small", compute_type="int8")
    segs, _ = m.transcribe(f"out/{slug}.wav", language="fr", word_timestamps=True)
    return [[w.word.strip(), int(w.start * 1000), int(w.end * 1000)] for s in segs for w in s.words]

for path in sorted(glob.glob("texts/*.txt")):
    slug = os.path.basename(path)[:-4]
    txt = open(path, encoding="utf-8").read().strip()
    try:
        words, used = asyncio.run(edge(slug, txt)), "remy"
    except Exception as e:
        print("edge-tts en échec :", repr(e), file=sys.stderr)
        words, used = piper(slug, txt), "piper_tom"
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"out/{slug}.wav"]))
    json.dump(words, open(f"out/{slug}.json", "w", encoding="utf-8"), ensure_ascii=False)
    status[slug] = {"voice": used, "duration_s": round(dur, 2), "words": len(words)}
json.dump(status, open("out/status.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(status, ensure_ascii=False))
