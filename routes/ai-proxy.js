const { Router } = require('express');
const { validateToken } = require('../middleware/auth-tesseract.js');

const router = Router();
router.use('/api', validateToken);

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_API = 'https://api.openai.com/v1/chat/completions';

async function callAI(apiUrl, apiKey, model, messages, maxTokens) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens || 500 })
  });
  return response.json();
}

function tryGroq(messages, model, maxTokens) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return Promise.resolve(null);
  return callAI(GROQ_API, key, model || 'llama3-70b-8192', messages, maxTokens);
}

function tryOpenAI(messages, model, maxTokens) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Promise.resolve(null);
  return callAI(OPENAI_API, key, model || 'gpt-3.5-turbo', messages, maxTokens);
}

function extractContent(data) {
  return data?.choices?.[0]?.message?.content || null;
}

// POST /api/chatgpt/chat - EATER AI (Groq gratis -> OpenAI fallback)
router.post('/api/chatgpt/chat', async (req, res) => {
  try {
    const { messages, model, max_tokens } = req.body;
    const payload = { messages, model, max_tokens };

    let data = await tryGroq(payload.messages, 'llama3-70b-8192', payload.max_tokens);
    if (data && extractContent(data)) {
      return res.json(data);
    }

    data = await tryOpenAI(payload.messages, payload.model || 'gpt-3.5-turbo', payload.max_tokens);
    if (data && extractContent(data)) {
      return res.json(data);
    }

    res.status(503).json({ error: 'No hay API key configurada (GROQ_API_KEY u OPENAI_API_KEY)', fallback: true });
  } catch (err) {
    console.error('[AI-PROXY] chat error:', err.message);
    res.status(500).json({ error: err.message, fallback: true });
  }
});

// POST /api/openai/translate - Traducción
router.post('/api/openai/translate', async (req, res) => {
  try {
    const { text, forceSpanish } = req.body;
    if (!text) return res.status(400).json({ error: 'Texto requerido' });

    const targetLang = forceSpanish ? 'es' : 'en';
    const systemMsg = `Traduce el siguiente texto al ${targetLang === 'es' ? 'español' : 'inglés'}. Responde SOLO con la traducción, sin explicaciones.`;

    let data = await tryGroq([{ role: 'system', content: systemMsg }, { role: 'user', content: text }], 'llama3-70b-8192', 500);
    let content = extractContent(data);
    if (content) {
      return res.json({ success: true, data: { translations: [{ text: content.trim() }] } });
    }

    data = await tryOpenAI([{ role: 'system', content: systemMsg }, { role: 'user', content: text }], 'gpt-3.5-turbo', 500);
    content = extractContent(data);
    if (content) {
      return res.json({ success: true, data: { translations: [{ text: content.trim() }] } });
    }

    res.json({ success: false, data: { translations: [{ text }] } });
  } catch (err) {
    res.json({ success: false, data: { translations: [{ text: req.body.text }] } });
  }
});

// POST /api/deepl/translate - DeepL-style translate
router.post('/api/deepl/translate', async (req, res) => {
  try {
    const { text, target } = req.body;
    if (!text) return res.status(400).json({ error: 'Texto requerido' });

    const systemMsg = `Traduce al ${target || 'español'}. Solo responde con el texto traducido.`;

    let data = await tryGroq([{ role: 'system', content: systemMsg }, { role: 'user', content: text }], 'llama3-70b-8192', 500);
    let content = extractContent(data);
    if (content) {
      return res.json({ translatedText: content.trim() });
    }

    data = await tryOpenAI([{ role: 'system', content: systemMsg }, { role: 'user', content: text }], 'gpt-3.5-turbo', 500);
    content = extractContent(data);
    if (content) {
      return res.json({ translatedText: content.trim() });
    }

    res.json({ translatedText: text });
  } catch (err) {
    res.json({ translatedText: req.body.text });
  }
});

module.exports = router;
