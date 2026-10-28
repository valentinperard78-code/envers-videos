// Outils de capture d'images pour le rendu automatique (utilisés par Puppeteer).
export async function canvasToBase64(canvas, type = 'image/jpeg', quality = 0.93) {
  const blob = await new Promise((res) => canvas.toBlob(res, type, quality));
  const ab = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < ab.length; i += 0x8000) s += String.fromCharCode.apply(null, ab.subarray(i, i + 0x8000));
  return btoa(s);
}
