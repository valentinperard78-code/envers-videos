# Synthèse vocale gratuite (voix neuronales Microsoft Edge) avec horodatage mot par mot.
# Entrée (stdin) : liste JSON [{key, text, voice, rate, pitch, out}] ; sortie : <out>.json avec les mots.
import asyncio, json, sys

async def one(job, sem):
    import edge_tts
    # toujours la voix du personnage : jamais de voix de remplacement (sinon changement de voix / d'accent)
    voice = job['voice']
    async with sem:
        for attempt in range(8):
            try:
                kw = dict(rate=job.get('rate', '+0%'), pitch=job.get('pitch', '+0Hz'))
                try:
                    com = edge_tts.Communicate(job['text'], voice, boundary='WordBoundary', **kw)
                except TypeError:
                    com = edge_tts.Communicate(job['text'], voice, **kw)
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
                return True
            except Exception as e:
                print('RETRY', job['key'], repr(e), flush=True)
                await asyncio.sleep(min(30, 2 * (attempt + 1) ** 1.5))
        print('FAIL', job['key'], flush=True)
        return False

async def main():
    jobs = json.loads(sys.stdin.read())
    sem = asyncio.Semaphore(3)
    res = await asyncio.gather(*(one(j, sem) for j in jobs))
    if not all(res):
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())
