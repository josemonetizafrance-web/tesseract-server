const { Router } = require('express');
const { validateToken } = require('../middleware/auth-tesseract.js');

const router = Router();

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_API = 'https://api.openai.com/v1/chat/completions';

async function callAI(apiUrl, apiKey, model, messages, maxTokens) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens || 500 })
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

function tryGroq(messages, model, maxTokens) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return Promise.resolve({ ok: false, status: 0, data: { error: 'GROQ_API_KEY no configurada' } });
  return callAI(GROQ_API, key, model || 'llama-3.3-70b-versatile', messages, maxTokens);
}

function tryOpenAI(messages, model, maxTokens) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Promise.resolve({ ok: false, status: 0, data: { error: 'OPENAI_API_KEY no configurada' } });
  return callAI(OPENAI_API, key, model || 'gpt-3.5-turbo', messages, maxTokens);
}

function extractContent(data) {
  return data?.choices?.[0]?.message?.content || null;
}

// POST /api/chatgpt/chat - EATER AI (Groq gratis -> OpenAI fallback)
router.post('/api/chatgpt/chat', validateToken, async (req, res) => {
  try {
    const { messages, model, max_tokens } = req.body;
    const payload = { messages, model, max_tokens };

    const groqResult = await tryGroq(payload.messages, 'llama-3.3-70b-versatile', payload.max_tokens);
    if (groqResult.ok && extractContent(groqResult.data)) {
      return res.json(groqResult.data);
    }
    console.error('[AI-PROXY] Groq falló:', JSON.stringify({ status: groqResult.status, error: groqResult.data?.error || groqResult.data }));

    const openaiResult = await tryOpenAI(payload.messages, payload.model || 'gpt-3.5-turbo', payload.max_tokens);
    if (openaiResult.ok && extractContent(openaiResult.data)) {
      return res.json(openaiResult.data);
    }
    console.error('[AI-PROXY] OpenAI falló:', JSON.stringify({ status: openaiResult.status, error: openaiResult.data?.error || openaiResult.data }));

    const groqError = groqResult.data?.error?.message || groqResult.data?.error || 'desconocido';
    const openaiError = openaiResult.data?.error?.message || openaiResult.data?.error || 'no configurado';
    res.status(503).json({
      error: 'Ambos proveedores AI fallaron',
      groq: { status: groqResult.status, error: groqError },
      openai: { status: openaiResult.status, error: openaiError },
      fallback: true
    });
  } catch (err) {
    console.error('[AI-PROXY] chat error:', err.message);
    res.status(500).json({ error: err.message, fallback: true });
  }
});

// POST /api/openai/translate - Traducción
router.post('/api/openai/translate', validateToken, async (req, res) => {
  try {
    const { text, targetLang, targetName, forceSpanish } = req.body;
    if (!text) return res.status(400).json({ error: 'Texto requerido' });

    // Soporte para multi-idioma (targetLang: en, fr, pt) o legacy (forceSpanish)
    let langCode, langName;
    if (targetLang && targetName) {
      langCode = targetLang;
      langName = targetName;
    } else if (forceSpanish) {
      langCode = 'es';
      langName = 'español';
    } else {
      langCode = 'en';
      langName = 'inglés';
    }

    const systemMsg = `Traduce el siguiente texto del español al ${langName} (${langCode}). Responde SOLO con la traducción, sin explicaciones ni notas.`;

    var groqResult2 = await tryGroq([{ role: 'system', content: systemMsg }, { role: 'user', content: text }], 'llama-3.3-70b-versatile', 500);
    var content2 = groqResult2.ok ? extractContent(groqResult2.data) : null;
    if (content2) {
      return res.json({ success: true, data: { translations: [{ text: content2.trim() }] } });
    }

    var openaiResult2 = await tryOpenAI([{ role: 'system', content: systemMsg }, { role: 'user', content: text }], 'gpt-3.5-turbo', 500);
    var content3 = openaiResult2.ok ? extractContent(openaiResult2.data) : null;
    if (content3) {
      return res.json({ success: true, data: { translations: [{ text: content3.trim() }] } });
    }

    res.json({ success: false, data: { translations: [{ text }] } });
  } catch (err) {
    res.json({ success: false, data: { translations: [{ text: req.body.text }] } });
  }
});

// POST /api/deepl/translate - DeepL-style translate
router.post('/api/deepl/translate', validateToken, async (req, res) => {
  try {
    const { text, target } = req.body;
    if (!text) return res.status(400).json({ error: 'Texto requerido' });

    const systemMsg = `Traduce al ${target || 'español'}. Solo responde con el texto traducido.`;

    var groqResult3 = await tryGroq([{ role: 'system', content: systemMsg }, { role: 'user', content: text }], 'llama-3.3-70b-versatile', 500);
    var content4 = groqResult3.ok ? extractContent(groqResult3.data) : null;
    if (content4) {
      return res.json({ translatedText: content4.trim() });
    }

    var openaiResult3 = await tryOpenAI([{ role: 'system', content: systemMsg }, { role: 'user', content: text }], 'gpt-3.5-turbo', 500);
    var content5 = openaiResult3.ok ? extractContent(openaiResult3.data) : null;
    if (content5) {
      return res.json({ translatedText: content5.trim() });
    }

    res.json({ translatedText: text });
  } catch (err) {
    res.json({ translatedText: req.body.text });
  }
});

module.exports = router;
