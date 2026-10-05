// GymCoach UDV — proxy só-leitura para classificações FPB (Vercel, plano Hobby gratuito).
// GET /api/fpb?comp=11489&fases=33689,33690  ->  JSON com a classificação oficial de cada fase/grupo.
const ALLOWED_ORIGINS = ['https://gymcoach-udv.web.app', 'https://gymcoach-udv.firebaseapp.com', 'http://localhost:5000'];
const num = v => { const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10); return isNaN(n) ? 0 : n; };
const strip = s => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function parseClassificacao(html) {
  const rows = [];
  const parts = html.split(/class="team-row/).slice(1);
  for (const p of parts) {
    const id = (p.match(/equipa\/equipa_(\d+)/) || [])[1] || null;
    const nome = strip((p.match(/<h5 class="only-desktop">([\s\S]*?)<\/h5>/) || [])[1] || '');
    const sigla = strip((p.match(/<h5 class="only-mobile">([\s\S]*?)<\/h5>/) || [])[1] || '');
    const nums = [...p.matchAll(/<h5>(?:<b>)?\s*(-?\d+)\s*(?:<\/b>)?<\/h5>/g)].map(m => num(m[1]));
    // ordem: posição, J, V, D, FC, PM, PS, DIF, PTS
    if (!nome || nums.length < 9) continue;
    const [pos, J, V, D, FC, PM, PS, DIF, PTS] = nums.slice(0, 9);
    rows.push({ pos, fpbId: id, nome, sigla, J, V, D, FC, PM, PS, DIF, PTS });
  }
  return rows;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 's-maxage=300');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const comp = String(req.query.comp || '');
  const fases = String(req.query.fases || '').split(',').filter(Boolean);
  if (!/^\d{1,8}$/.test(comp) || !fases.length || fases.length > 20 || !fases.every(f => /^\d{1,8}$/.test(f)))
    return res.status(400).json({ error: 'parametros invalidos' });

  const out = {};
  await Promise.all(fases.map(async f => {
    try {
      const url = `https://www.fpb.pt/wp-admin/admin-ajax.php?action=get_more_fase_regular&competicao%5B%5D=${comp}&fase=${f}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 GymCoachUDV' } });
      const j = await r.json();
      out[f] = { ok: true, equipas: parseClassificacao((j.result && j.result.body) || '') };
    } catch (e) { out[f] = { ok: false, erro: String(e.message || e) }; }
  }));
  res.status(200).json({ comp, atualizadoEm: new Date().toISOString(), fases: out });
};
