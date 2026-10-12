// GymCoach UDV — catálogo só-leitura do Centro de Resultados FPB/ABL (resultados.tugabasket.com).
// GET /api/catalogo?assoc=1|50       -> lista de provas da época mais recente com provas (assoc 1 = ABL, 50 = FPB); ?season=ID força a época
// GET /api/catalogo                -> lista de provas da época  { provas:[{id,nome,categoria,genero}] }
// GET /api/catalogo?comp=11489     -> fases/grupos da prova     { fases:[{label,phaseId,equipas:[{pos,nome,J,V,D,PTS}]}] }
// GET /api/catalogo?comp=11489&phase=33690 -> calendario+resultados { jornadas:[{numero,jogos:[{data,hora,casa,fora,resultadoCasa,resultadoFora,recinto}]}] }
// Os IDs (prova/fase) são os mesmos da FPB, por isso /api/fpb continua a servir a classificação oficial.
// Só pede URLs fixas ao host abaixo (nenhum URL vem do cliente). Plano Hobby gratuito do Vercel.
const ALLOWED_ORIGINS = ['https://gymcoach-udv.web.app', 'https://gymcoach-udv.firebaseapp.com', 'http://localhost:5000'];
const HOST = 'https://resultados.tugabasket.com';

const ent = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const clean = s => ent(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const num = v => { const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10); return isNaN(n) ? 0 : n; };

function parseProvas(html) {
  const out = [];
  const secs = html.split(/<h4 class="competition-title">/).slice(1);
  for (const sec of secs) {
    const genero = /Feminin/i.test(sec.slice(0, 80)) ? 'F' : 'M';
    for (const it of sec.split(/<li class="item">/).slice(1)) {
      const id = (it.match(/competitionId=(\d+)/) || [])[1];
      const nome = clean((it.match(/class="league-name">([\s\S]*?)<\/div>/) || [])[1]);
      const categoria = clean((it.match(/class="league-category[^"]*">([\s\S]*?)<\/div>/) || [])[1]);
      if (id && nome) out.push({ id, nome, categoria, genero });
    }
  }
  return out;
}

function parseEpocas(html) {
  const sel = (html.match(/<select[^>]*id="seasonId"[\s\S]*?<\/select>/) || [''])[0];
  return [...sel.matchAll(/<option[^>]*value="(\d+)"/g)].map(m => m[1]);
}

function parseFases(html) {
  const out = [];
  for (const ch of html.split(/<div class="accordion-title">/).slice(1)) {
    const label = clean((ch.match(/<div[^>]*>([\s\S]*?)<span class="arrow"/) || [])[1]);
    const phaseId = (ch.match(/phaseId=(\d+)/) || [])[1];
    const tbl = (ch.match(/<table[^>]*standings[^>]*>([\s\S]*?)<\/table>/) || [])[1] || '';
    const equipas = [];
    for (const tr of tbl.split(/<tr[^>]*>/).slice(1)) {
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => clean(m[1]));
      if (tds.length >= 6 && tds[1]) equipas.push({ pos: num(tds[0]), nome: tds[1], J: num(tds[2]), V: num(tds[3]), D: num(tds[4]), PTS: num(tds[5]) });
    }
    if (label && phaseId) out.push({ label, phaseId, equipas });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, 'pt', { numeric: true }));
}

function parseCalendario(html) {
  const jornadas = [];
  for (const sec of html.split(/<h5>/).slice(1)) {
    const numero = num((sec.match(/^\s*(\d+)\s*ª/) || [])[1]);
    if (!numero) continue;
    const jogos = [];
    for (const tr of sec.split(/<tr[^>]*>/).slice(1)) {
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => clean(m[1]));
      if (tds.length < 7 || !/^\d{4}-\d{2}-\d{2}$/.test(tds[1])) continue;
      const m = tds[4].match(/^(\d+)\s*:\s*(\d+)$/);
      jogos.push({ jogo: tds[0], data: tds[1], hora: tds[2], casa: tds[3], fora: tds[5], recinto: tds[6],
        resultadoCasa: m ? +m[1] : null, resultadoFora: m ? +m[2] : null });
    }
    jornadas.push({ numero, jogos });
  }
  return jornadas;
}

async function get(path) {
  const r = await fetch(HOST + path, { headers: { 'User-Agent': 'Mozilla/5.0 GymCoachUDV' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const assoc = String(req.query.assoc || '1'), seasonQ = req.query.season ? String(req.query.season) : '', comp = req.query.comp ? String(req.query.comp) : '';
  if (!/^\d{1,6}$/.test(assoc) || (seasonQ && !/^\d{1,6}$/.test(seasonQ)) || (comp && !/^\d{1,8}$/.test(comp)))
    return res.status(400).json({ error: 'parametros invalidos' });
  try {
    if (!comp) {
      // Época automática: sem ?season=, usa a época mais recente (1ª opção do seletor do site) que já tenha provas.
      const seasons = seasonQ ? [seasonQ] : parseEpocas(await get(`/competitions?associationId=${assoc}`)).slice(0, 3);
      let provas = [], season = '';
      for (const sid of seasons) {
        provas = parseProvas(await get(`/competitions?associationId=${assoc}&seasonId=${sid}`));
        if (provas.length) { season = sid; break; }
      }
      if (!provas.length) return res.status(502).json({ error: 'estrutura inesperada (provas)' });
      res.setHeader('Cache-Control', 's-maxage=3600');
      return res.status(200).json({ atualizadoEm: new Date().toISOString(), assoc, season, provas });
    }
    const phase = req.query.phase ? String(req.query.phase) : '';
    if (phase) {
      if (!/^\d{1,8}$/.test(phase)) return res.status(400).json({ error: 'parametros invalidos' });
      const jornadas = parseCalendario(await get(`/getSchedule?competitionId=${comp}&phaseId=${phase}`));
      if (!jornadas.length) return res.status(502).json({ error: 'estrutura inesperada (calendario)' });
      res.setHeader('Cache-Control', 's-maxage=300');
      return res.status(200).json({ comp, phase, atualizadoEm: new Date().toISOString(), jornadas });
    }
    const fases = parseFases(await get(`/getCompetitionDetails?competitionId=${comp}`));
    if (!fases.length) return res.status(502).json({ error: 'estrutura inesperada (fases)' });
    res.setHeader('Cache-Control', 's-maxage=600');
    return res.status(200).json({ comp, atualizadoEm: new Date().toISOString(), fases });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
};
module.exports.parseProvas = parseProvas;
module.exports.parseFases = parseFases;
module.exports.parseEpocas = parseEpocas;
module.exports.parseCalendario = parseCalendario;
