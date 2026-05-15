/**
 * ROUTES/SUPPORT-TESSERACT - Sistema de contacto con el desarrollador
 */
const { Router } = require('express');
const nodemailer = require('nodemailer');

const router = Router();

// Configurar transporter (usar variables de entorno)
const createTransporter = () => {
  if (!process.env.SMTP_HOST) {
    console.log('[SUPPORT] SMTP no configurado - usando modo demo');
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// POST /api/tess/support/message - Enviar mensaje al desarrollador
router.post('/api/tess/support/message', async (req, res) => {
  try {
    const { email, message, subject } = req.body;
    
    if (!email || !message) {
      return res.status(400).json({ error: 'Email y mensaje requeridos' });
    }

    const adminEmail = process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com';
    const subjectLine = subject || 'Nuevo mensaje de usuario TESSERACT';

    const transporter = createTransporter();

    if (transporter) {
      await transporter.sendMail({
        from: process.env.SMTP_USER || 'noreply@tesseract.com',
        to: adminEmail,
        subject: `[TESSERACT] ${subjectLine}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
            <h2 style="color: #8b5cf6;">📬 Nuevo mensaje de soporte</h2>
            <div style="background: white; padding: 20px; border-radius: 8px;">
              <p><strong>Usuario:</strong> ${email}</p>
              <p><strong>Asunto:</strong> ${subjectLine}</p>
              <hr style="border: 1px solid #eee; margin: 15px 0;">
              <p><strong>Mensaje:</strong></p>
              <p style="white-space: pre-wrap;">${message}</p>
            </div>
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              Enviado desde TESSERACT v24.0
            </p>
          </div>
        `
      });
      console.log(`[SUPPORT] Email enviado a ${adminEmail} desde ${email}`);
    } else {
      console.log(`[SUPPORT] Modo demo - mensaje de ${email}: ${message.substring(0, 50)}...`);
    }

    return res.json({ 
      success: true, 
      message: 'Mensaje enviado correctamente' 
    });

  } catch (err) {
    console.error('[SUPPORT ERROR]', err);
    return res.status(500).json({ error: 'Error al enviar mensaje: ' + err.message });
  }
});

// GET /api/tess/support/status - Verificar estado del sistema de soporte
router.get('/api/tess/support/status', (req, res) => {
  const hasEmail = !!(process.env.SMTP_HOST && process.env.SMTP_USER);
  return res.json({
    available: true,
    emailConfigured: hasEmail,
    adminEmail: process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com'
  });
});

module.exports = router;