# Synthèse vocale gratuite (voix neuronales Microsoft Edge) avec horodatage mot par mot.
# Entrée (stdin) : liste JSON [{key, text, voice, rate, pitch, out}] ; sortie : <out>.json avec les mots.
import asyncio, json, sys

async def one(job, sem):
    import edge_tts
    async with sem:
        for attempt in range(4):
            try:
                kw = dict(rate=job.get('rate', '+0%'), pitch=job.get('pitch', '+0Hz'))
                try:
                    com = edge_tts.Communicate(job['text'], job['voice'], boundary='WordBoundary', **kw)
                except TypeError:
                    com = edge_tts.Communicate(job['text'], job['voice'], **kw)
                words, audio = [], bytearray()
                async for chunk in com.stream():
                    if chunk['type'] == 'audio':
                        audio.extend(chunk['data'])
                    elif chunk['type'] == 'WordBoundary':
                        words.append({'t': chunk['offset'] / 1e7, 'd': chunk['duration'] / 1e7, 'w': chunk['text']})
                if not audio:
                    raise RuntimeError('audio vide')
                with open(job['out'], 'wb') as f:
                    f.write(audio)
                with open(job['out'] + '.json', 'w', encoding='utf-8') as f:
                    json.dump({'words': words}, f, ensure_ascii=False)
                print('OK', job['key'], flush=True)
                return
            except Exception as e:
                print('RETRY', job['key'], repr(e), flush=True)
                await asyncio.sleep(1.5 * (attempt + 1))
        print('FAIL', job['key'], flush=True)

async def main():
    jobs = json.loads(sys.stdin.read())
    sem = asyncio.Semaphore(4)
    await asyncio.gather(*(one(j, sem) for j in jobs))

if __name__ == '__main__':
    asyncio.run(main())
