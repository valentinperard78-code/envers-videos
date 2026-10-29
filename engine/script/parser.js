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
  return String(s).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function parseScript(src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  const doc = { title: '', episode: null, episodeName: '', pathology: '', notes: [], casting: [], sections: [], sources: [] };
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
      let title = clean(line.replace(/^##+\s+/, ''));
      const lieu = title.match(/[\[(]\s*(?:lieu|d[ée]cor)\s*:\s*([^\])]+)[\])]/i);
      if (lieu) title = title.replace(lieu[0], '').trim();
      const low = slug(title);
      let kind = 'scene';
      if (low.startsWith('casting') || low.startsWith('personnages')) kind = 'casting';
      else if (low.startsWith('teaser') || low.includes('cold-open')) kind = 'teaser';
      else if (low.startsWith('precedemment') || low.startsWith('previously') || low.startsWith('resume-de-l-episode')) kind = 'previously';
      else if (low.startsWith('recap') || low.includes('a-retenir') || low.includes('conclusion')) kind = 'recap';
      else if (low.startsWith('sources')) kind = 'sources';
      else if (low.startsWith('notes')) kind = 'notes';
      const num = title.match(/(\d+)/);
      section = { kind, title, location: lieu ? lieu[1].trim() : '', name: title.replace(/^sc[eè]ne\s*\d+\s*[:\-–]\s*/i, ''), number: num ? +num[1] : null, items: [] };
      if (kind !== 'casting' && kind !== 'sources' && kind !== 'notes') doc.sections.push(section);
      continue;
    }
    const body = clean(line.replace(/^[-*•]\s+/, ''));
    if (!section) { doc.notes.push(body); continue; }
    if (section.kind === 'casting') {
      const m = body.match(/^([^:]+?)\s*[:\-–]\s*(.+)$/);
      if (m) doc.casting.push({ name: m[1].trim(), description: m[2].trim() });
      continue;
    }
    if (section.kind === 'sources') {
      const url = (body.match(/https?:\/\/\S+/) || [''])[0].replace(/[)\].,]+$/, '');
      const name = body.replace(/https?:\/\/\S+/, '').replace(/[\[\]()]/g, '').replace(/[:\-–]\s*$/, '').trim();
      doc.sources.push({ name: name || url, url });
      continue;
    }
    if (section.kind === 'notes') continue;
    const item = parseItem(body, lineNo);
    if (item) section.items.push(item);
  }
  placeGeneric(doc);
  return doc;
}

/**
 * Générique de la série, présent dans chaque épisode :
 * accroche/teaser → GÉNÉRIQUE (logo + à quoi sert la série, avec voix off) → « Précédemment » → épisode.
 * Le « → GÉNÉRIQUE » écrit dans le script est déplacé à cette place ; s'il manque, il est ajouté.
 */
export const GENERIC_VO = 'La Villa des Pathologies : une maladie par épisode, pour comprendre ton corps… façon télé-réalité !';
function placeGeneric(doc) {
  let line = 99001;
  for (const sec of doc.sections) { const i = sec.items.findIndex((it) => it.type === 'title'); if (i >= 0) { line = sec.items[i].line; sec.items.splice(i, 1); } }
  doc.sections = doc.sections.filter((sec) => sec.items.length || sec.kind === 'scene');
  const teaser = doc.sections.filter((s) => s.kind === 'teaser');
  const prev = doc.sections.filter((s) => s.kind === 'previously');
  const rest = doc.sections.filter((s) => s.kind !== 'teaser' && s.kind !== 'previously');
  const gen = { kind: 'generic', title: 'Générique', name: 'Générique', location: '', number: null, items: [{ type: 'title', line, vo: GENERIC_VO }] };
  doc.sections = [...teaser, gen, ...prev, ...rest]; // accroche (2-3 s) → générique → « Précédemment » → épisode
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
  // accroche à l'écran (premières secondes) / question pour les commentaires
  m = body.match(/^accroche(?:\s+[àa]\s+l['’]?[ée]cran)?\s*[:\-–]\s*(.+)$/i);
  if (m) return { type: 'hook', text: m[1].replace(/[«»"]/g, '').trim(), line: lineNo };
  m = body.match(/^question(?:\s+(?:commentaires?|aux abonn[ée]s|finale))?\s*[:\-–]\s*(.+)$/i);
  if (m) return { type: 'question', text: m[1].replace(/[«»"]/g, '').trim(), line: lineNo };
  // indication d'écran
  m = body.match(/^(?:[àa]\s+l['’]?[ée]cran|[ée]cran|visuel)\s*[:\-–]\s*(.+)$/i);
  if (m) return { type: 'screen', text: m[1].trim(), line: lineNo };
  // réplique : NOM (didascalie) : « texte »
  m = body.match(/^([A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ0-9'’ .\-]{1,30}?)\s*(\(([^)]*)\))?\s*[:\-–]\s*(.+)$/);
  if (m) {
    const who = m[1].trim(), rest = m[4].trim();
    let dida = (m[3] || '').trim();
    const lieu = (dida + ' ' + rest).match(/\[\s*(?:lieu|d[ée]cor)\s*:\s*([^\]]+)\]/i);
    dida = dida.replace(/\[[^\]]*\]/g, '').trim();
    const qs = quotes(rest);
    const text = (qs.length ? qs.join(' ') : rest).trim();
    const after = rest.replace(QUOTE_RE, '').trim();
    const noteM = after.match(/\(([^)]*)\)/);
    const isVO = /^(VOIX[ -]?OFF|NARRAT|LA VOIX)/i.test(who);
    return { type: 'line', speaker: isVO ? 'VOIX OFF' : who, voiceOver: isVO, direction: dida, text: text.replace(/\[[^\]]*\]/g, '').trim(), note: noteM ? noteM[1].trim() : '', location: lieu ? lieu[1].trim() : '', line: lineNo };
  }
  // ligne libre entre guillemets -> voix off
  const qs = quotes(body);
  if (qs.length) return { type: 'line', speaker: 'VOIX OFF', voiceOver: true, direction: '', text: qs.join(' '), note: '', line: lineNo };
  return { type: 'note', text: body, line: lineNo };
}
