# gymcoach-fpb-proxy
Proxy só-leitura (Vercel Hobby, gratuito) para a app GymCoach UDV obter as classificações oficiais da FPB.
Endpoint: /api/fpb?comp=11489&fases=33684,33685,33686,33687,33689,33690,33691,33693,33694
IDs Sub-16 M 2026/27 (comp 11489): F1G1 33684 · F1G2 33685 · F1G3-A 33686 · F1G3-B 33687 · F1G4-A 33689 · F1G4-B 33690 · F1G5-A 33691 · F1G5-B 33693 · F1G6 33694

## /api/catalogo (v38hg)
Lista provas e fases/equipas do Centro de Resultados FPB/ABL (resultados.tugabasket.com), só leitura, URLs fixas.
- `/api/catalogo` → `{ provas:[{id,nome,categoria,genero}] }` (opcional `assoc`: 1 = ABL (distrital), 50 = FPB (nacional); a época é detetada automaticamente — a mais recente com provas —, `season` só serve para forçar uma). `?comp=ID&phase=ID` devolve o calendário com resultados.
- `/api/catalogo?comp=11489` → `{ fases:[{label,phaseId,equipas:[{pos,nome,J,V,D,PTS}]}] }`
Os IDs são os mesmos da FPB, por isso `/api/fpb` continua a fornecer a classificação oficial.
