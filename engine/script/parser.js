// Lecture du script « Villa des Pathologies » (format Markdown simple). Fonctionne dans Node et le navigateur.
//
// Format reconnu (souple) :
//   # Titre — Épisode N : « Nom » (pathologie)
//   ## Casting
//   - **Nom** : description (archétype, couleur, accessoires, caractère…)
//   ## Teaser / ## Scène N : titre / ## Récap…
//   - PERSONNAGE (didascalie) : « réplique »
//   - VOIX OFF : « texte »
//   - Encadré à l'écran : MOT = explication
//   - Carton : « 10 ANS PLUS TARD… »
//   - À l'écran : la jauge de glycémie passe au rouge
//   - → GÉNÉRIQUE

const QUOTE_RE = /«\s*([\s\S]*?)\s*»|“([\s\S]*?)”|"([^"]*)"/g;

function clean(s) { return String(s || '').replace(/\*\*/g, '').replace(/__/g, '').trim(); }
function quotes(s) {
  const out = []; let m; QUOTE_RE.lastIndex = 0;
  while ((m = QUOTE_RE.exec(s))) out.push((m[1] ?? m[2] ?? m[3] ?? '').trim());
  return out;
}
export function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function parseScript(src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  const doc = { title: '', episode: null, episodeName: '', pathology: '', notes: [], casting: [], sections: [] };
  let section = null, lineNo = 0;
  for (const raw of lines) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    // titre
    if (/^#\s+/.test(line) && !/^##/.test(line)) {
      doc.title = clean(line.replace(/^#\s+/, ''));
      const ep = doc.title.match(/[ÉéEe]pisode\s*(\d+)/); if (ep) doc.episode = +ep[1];
      const q = quotes(doc.title); if (q.length) doc.episodeName = q[0];
      const par = doc.title.match(/\(([^)]*)\)\s*$/); if (par) doc.pathology = par[1].trim();
      continue;
    }
    if (/^##+\s+/.test(line)) {
      const title = clean(line.replace(/^##+\s+/, ''));
      const low = slug(title);
      let kind = 'scene';
      if (low.startsWith('casting') || low.startsWith('personnages')) kind = 'casting';
      else if (low.startsWith('teaser') || low.includes('cold-open')) kind = 'teaser';
      else if (low.startsWith('recap') || low.includes('a-retenir') || low.includes('conclusion')) kind = 'recap';
      else if (low.startsWith('notes') || low.startsWith('sources')) kind = 'notes';
      const num = title.match(/(\d+)/);
      section = { kind, title, name: title.replace(/^sc[eè]ne\s*\d+\s*[:\-–]\s*/i, ''), number: num ? +num[1] : null, items: [] };
      if (kind !== 'casting') doc.sections.push(section);
      continue;
    }
    const body = clean(line.replace(/^[-*•]\s+/, ''));
    if (!section) { doc.notes.push(body); continue; }
    if (section.kind === 'casting') {
      const m = body.match(/^([^:]+?)\s*[:\-–]\s*(.+)$/);
      if (m) doc.casting.push({ name: m[1].trim(), description: m[2].trim() });
      continue;
    }
    if (section.kind === 'notes') continue;
    const item = parseItem(body, lineNo);
    if (item) section.items.push(item);
  }
  return doc;
}

export function parseItem(body, lineNo = 0) {
  // générique
  if (/^(→|->|=>)?\s*G[ÉE]N[ÉE]RIQUE\b/i.test(body)) return { type: 'title', line: lineNo };
  // carton
  let m = body.match(/^carton\s*[:\-–]\s*(.+)$/i);
  if (m) { const q = quotes(m[1]); return { type: 'card', text: q[0] || m[1].replace(/[«»"]/g, '').trim(), line: lineNo }; }
  // encadré
  m = body.match(/^encadr[ée](?:\s+[àa]\s+l['’]?[ée]cran)?\s*[:\-–]\s*(.+)$/i);
  if (m) {
    const txt = m[1].trim();
    const eq = txt.match(/^([^=:]{1,40}?)\s*[=:]\s*(.+)$/);
    return eq ? { type: 'box', title: eq[1].trim(), text: eq[2].trim(), line: lineNo } : { type: 'box', title: 'À savoir', text: txt, line: lineNo };
  }
  // indication d'écran
  m = body.match(/^(?:[àa]\s+l['’]?[ée]cran|[ée]cran|visuel)\s*[:\-–]\s*(.+)$/i);
  if (m) return { type: 'screen', text: m[1].trim(), line: lineNo };
  // réplique : NOM (didascalie) : « texte »
  m = body.match(/^([A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ0-9'’ .\-]{1,30}?)\s*(\(([^)]*)\))?\s*[:\-–]\s*(.+)$/);
  if (m) {
    const who = m[1].trim(), dida = (m[3] || '').trim(), rest = m[4].trim();
    const qs = quotes(rest);
    const text = (qs.length ? qs.join(' ') : rest).trim();
    const after = rest.replace(QUOTE_RE, '').trim();
    const noteM = after.match(/\(([^)]*)\)/);
    const isVO = /^(VOIX[ -]?OFF|NARRAT|LA VOIX)/i.test(who);
    return { type: 'line', speaker: isVO ? 'VOIX OFF' : who, voiceOver: isVO, direction: dida, text, note: noteM ? noteM[1].trim() : '', line: lineNo };
  }
  // ligne libre entre guillemets -> voix off
  const qs = quotes(body);
  if (qs.length) return { type: 'line', speaker: 'VOIX OFF', voiceOver: true, direction: '', text: qs.join(' '), note: '', line: lineNo };
  return { type: 'note', text: body, line: lineNo };
}
