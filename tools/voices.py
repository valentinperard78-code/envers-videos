import asyncio, json, edge_tts
TXT = open("tools/samples.txt").read().strip()
VOICES = ["fr-FR-HenriNeural", "fr-FR-RemyMultilingualNeural", "fr-FR-DeniseNeural", "fr-FR-VivienneMultilingualNeural"]
async def one(v):
    c = edge_tts.Communicate(TXT, v, boundary="WordBoundary")
    words = []
    with open(f"out/{v}.mp3", "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio": f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append([ch["text"], ch["offset"] // 10000, (ch["offset"] + ch["duration"]) // 10000])
    json.dump(words, open(f"out/{v}.json", "w"), ensure_ascii=False)
async def main():
    for v in VOICES:
        try: await one(v)
        except Exception as e: open(f"out/{v}.err", "w").write(repr(e))
asyncio.run(main())
