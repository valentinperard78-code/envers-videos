"""Voix multiples pour les dialogues : dialogue/<episode>.json = [{"id","voice","rate","pitch","text"}, ...]
-> out/<episode>/<id>.wav (24 kHz mono) + <id>.json (mots minutés, ponctuation du texte)."""
import asyncio, glob, json, os, re, subprocess, sys
import edge_tts

def norm(t):
    return re.sub(r"[^0-9a-zà-ÿœæ]", "", t.lower())

def align(words, txt):
    raw = txt.split(); toks = []; pre = ""
    for t in raw:
        if not norm(t) and t in ("«", "(", "“"):
            pre += t + " "
        elif not norm(t) and toks:
            toks[-1] += " " + t
        else:
            toks.append(pre + t); pre = ""
    out = []; i = 0
    for w, s, e in words:
        target = norm(w); got = []; acc = ""
        while i < len(toks) and len(acc) < len(target):
            got.append(toks[i]); acc += norm(toks[i]); i += 1
        if acc != target or not got:
            return words
        n = len(got)
        for k, t in enumerate(got):
            out.append([t, s + (e - s) * k // n, s + (e - s) * (k + 1) // n])
    return out

async def one(line, base):
    c = edge_tts.Communicate(line["text"], line["voice"], rate=line.get("rate", "+0%"),
                             pitch=line.get("pitch", "+0Hz"), boundary="WordBoundary")
    words = []
    mp3 = f"{base}.mp3"
    with open(mp3, "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append([ch["text"], ch["offset"] // 10000, (ch["offset"] + ch["duration"]) // 10000])
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp3, "-ar", "24000", "-ac", "1", f"{base}.wav"], check=True)
    os.remove(mp3)
    json.dump(align(words, line["text"]), open(f"{base}.json", "w", encoding="utf-8"), ensure_ascii=False)

for path in sorted(glob.glob("dialogue/*.json")):
    ep = os.path.basename(path)[:-5]
    os.makedirs(f"out/{ep}", exist_ok=True)
    for line in json.load(open(path, encoding="utf-8")):
        if os.path.exists(f"out/{ep}/{line['id']}.wav"):
            continue
        for attempt in range(3):
            try:
                asyncio.run(one(line, f"out/{ep}/{line['id']}"))
                break
            except Exception as e:
                print("retry", line["id"], repr(e), file=sys.stderr)
        else:
            sys.exit(f"échec voix {line['id']}")
print("ok")
