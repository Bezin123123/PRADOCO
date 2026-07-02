// ============================================================
// /api/overview.js  —  Função serverless (Vercel)
// Recebe a transcrição, chama o Claude, devolve o overview.
// A chave da API fica escondida na env ANTHROPIC_API_KEY.
// ============================================================

export default async function handler(req, res) {
  // CORS básico (mesma origem, mas deixamos liberado por segurança)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Chave da API não configurada no Vercel.' }); return; }

  // corpo pode vir como string ou objeto dependendo do runtime
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { transcricao, tipo } = body || {};
  if (!transcricao || !transcricao.trim()) { res.status(400).json({ error: 'Sem transcrição.' }); return; }

  // prompt diferente pra fechamento vs onboarding
  const prompts = {
    fechamento: `Você é assistente de uma agência de marketing de farmácias (Prado & Co.). Abaixo está a TRANSCRIÇÃO de uma call de FECHAMENTO entre o vendedor (Pedro) e um novo cliente dono de farmácia.

Extraia e organize um OVERVIEW curto e objetivo em português para o gestor de projetos (Bernardo) já entrar na próxima call sabendo tudo. Use exatamente este formato, preenchendo só o que estiver na transcrição e marcando "(não mencionado)" no que faltar:

DADOS
• Farmácia:
• Cidade:
• Instagram:
• Responsável:

O QUE FOI FECHADO
• Plano/valor:
• Entregas prometidas:

JÁ SABEMOS
(liste bullets do que o cliente contou: tempo de mercado, tipo, produtos, entrega, etc — só o que aparece)

CONFIRMAR NA CALL DE ONBOARDING
(liste o que ainda falta perguntar: parcelamento, forte de preço, login, etc)

Seja conciso. Não invente nada que não esteja na transcrição.`,

    onboarding: `Você é assistente de uma agência de marketing de farmácias (Prado & Co.). Abaixo está a TRANSCRIÇÃO de uma call de ONBOARDING entre o gestor (Bernardo) e o cliente dono de farmácia.

Extraia um RESUMO estruturado em português, preenchendo só o que estiver na transcrição:

A FARMÁCIA
• Tipo/tempo de mercado:
• Funcionários:
• Entrega (grátis/taxa/raio):
• Parcelamento (vezes/mínimo):
• Planos/Farmácia Popular:
• Identidade visual:

CONTEÚDO
• Quem aparece nos vídeos:
• Segmento forte de PREÇO (o que ganha da concorrência):
• Serviços de saúde:

PONTOS DE ATENÇÃO
(liste riscos/oportunidades: entrega, promoção diária vs semanal, etc)

PENDÊNCIAS
(o que o cliente vai enviar ou confirmar depois)

Regras da casa a lembrar: nunca impulsionar conteúdo com crianças; prescrição usa caixa fantasia. Seja conciso e não invente.`
  };

  const systemPrompt = prompts[tipo] || prompts.fechamento;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [
          { role: 'user', content: systemPrompt + '\n\n=== TRANSCRIÇÃO ===\n' + transcricao }
        ]
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      res.status(502).json({ error: 'Erro na API da Anthropic: ' + errText.slice(0, 300) });
      return;
    }

    const data = await r.json();
    const texto = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    res.status(200).json({ overview: texto || '(resposta vazia)' });

  } catch (e) {
    res.status(500).json({ error: 'Falha: ' + (e.message || String(e)) });
  }
}
