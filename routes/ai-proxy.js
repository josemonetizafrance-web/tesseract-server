/**
 * ROUTES/AI-PROXY - Proxy para ChatGPT, DeepL y traducciones
 */
const { Router } = require('express');
const { validateToken } = require('../middleware/auth-tesseract.js');

const router = Router();
router.use('/api', validateToken);

// POST /api/chatgpt/chat - EATER AI
router.post('/api/chatgpt/chat', async (req, res) => {
  try {
    const { messages, model, max_tokens } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(503).json({ error: 'OPENAI_API_KEY no configurada en el servidor', fallback: true });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-3.5-turbo',
        messages: messages || [{ role: 'user', content: 'Hola' }],
        max_tokens: max_tokens || 500
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('[AI-PROXY] chatgpt error:', err.message);
    res.status(500).json({ error: err.message, fallback: true });
  }
});

// POST /api/openai/translate - Traducción con DeepSeek/DeepL
router.post('/api/openai/translate', async (req, res) => {
  try {
    const { text, translateWith, forceSpanish } = req.body;
    if (!text) return res.status(400).json({ error: 'Texto requerido' });

    const targetLang = forceSpanish ? 'es' : 'en';
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.json({
        success: false,
        data: { translations: [{ text: text }] }
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: `Traduce el siguiente texto al ${targetLang === 'es' ? 'español' : 'inglés'}. Responde SOLO con la traducción, sin explicaciones.` },
          { role: 'user', content: text }
        ],
        max_tokens: 500
      })
    });

    const data = await response.json();
    if (data.choices && data.choices[0]?.message?.content) {
      return res.json({
        success: true,
        data: { translations: [{ text: data.choices[0].message.content.trim() }] }
      });
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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.json({ translatedText: text });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: `Traduce al ${target || 'español'}. Solo responde con el texto traducido.` },
          { role: 'user', content: text }
        ],
        max_tokens: 500
      })
    });

    const data = await response.json();
    if (data.choices && data.choices[0]?.message?.content) {
      return res.json({ translatedText: data.choices[0].message.content.trim() });
    }
    res.json({ translatedText: text });
  } catch (err) {
    res.json({ translatedText: req.body.text });
  }
});

module.exports = router;
