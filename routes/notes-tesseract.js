const { Router } = require('express');
const { validateToken } = require('../middleware/auth-tesseract.js');
const {
  createNote, getUserNotes, getNotesSharedWithUser, updateNote, deleteNote,
  shareNoteWithUser, unshareNote, getNoteById, findUserByEmail, findUserById, getAllUsers
} = require('../db/tesseract.js');

const router = Router();

router.get('/api/tess/notes', validateToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const notes = await getUserNotes(userId);
    return res.json({ notes });
  } catch (err) {
    console.error('[NOTES GET ERROR]', err);
    return res.status(500).json({ error: 'Error al obtener notas' });
  }
});

router.post('/api/tess/notes', validateToken, async (req, res) => {
  try {
    const { profile_name, client_name, client_id, note_text } = req.body;
    if (!note_text) {
      return res.status(400).json({ error: 'note_text requerido' });
    }
    const userId = req.user._id.toString();
    const noteId = await createNote(userId, profile_name || '', client_name || '', client_id || '', note_text);
    return res.json({ success: true, note_id: noteId });
  } catch (err) {
    console.error('[NOTES CREATE ERROR]', err);
    return res.status(500).json({ error: 'Error al crear nota' });
  }
});

router.put('/api/tess/notes/:id', validateToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { profile_name, client_name, client_id, note_text } = req.body;
    const updated = await updateNote(req.params.id, userId, { profile_name, client_name, client_id, note_text });
    if (!updated) return res.status(404).json({ error: 'Nota no encontrada' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[NOTES UPDATE ERROR]', err);
    return res.status(500).json({ error: 'Error al actualizar nota' });
  }
});

router.delete('/api/tess/notes/:id', validateToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const deleted = await deleteNote(req.params.id, userId);
    if (!deleted) return res.status(404).json({ error: 'Nota no encontrada' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[NOTES DELETE ERROR]', err);
    return res.status(500).json({ error: 'Error al eliminar nota' });
  }
});

router.post('/api/tess/notes/:id/share', validateToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { target_email } = req.body;
    if (!target_email) return res.status(400).json({ error: 'target_email requerido' });

    const targetUser = await findUserByEmail(target_email);
    if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

    const shared = await shareNoteWithUser(req.params.id, userId, targetUser._id.toString());
    if (!shared) return res.status(404).json({ error: 'Nota no encontrada' });
    return res.json({ success: true, shared_with: target_email });
  } catch (err) {
    console.error('[NOTES SHARE ERROR]', err);
    return res.status(500).json({ error: 'Error al compartir nota' });
  }
});

router.post('/api/tess/notes/:id/unshare', validateToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { target_email } = req.body;
    if (!target_email) return res.status(400).json({ error: 'target_email requerido' });

    const targetUser = await findUserByEmail(target_email);
    if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

    const unshared = await unshareNote(req.params.id, userId, targetUser._id.toString());
    if (!unshared) return res.status(404).json({ error: 'Nota no encontrada' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[NOTES UNSHARE ERROR]', err);
    return res.status(500).json({ error: 'Error al dejar de compartir nota' });
  }
});

router.get('/api/tess/notes/shared', validateToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const notes = await getNotesSharedWithUser(userId);
    return res.json({ notes });
  } catch (err) {
    console.error('[NOTES SHARED GET ERROR]', err);
    return res.status(500).json({ error: 'Error al obtener notas compartidas' });
  }
});

router.get('/api/tess/notes/users', validateToken, async (req, res) => {
  try {
    const allUsers = await getAllUsers();
    const userList = allUsers
      .filter(u => u._id.toString() !== req.user._id.toString())
      .map(u => ({ email: u.email, _id: u._id.toString(), office: u.office }));
    return res.json({ users: userList });
  } catch (err) {
    console.error('[NOTES USERS ERROR]', err);
    return res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

module.exports = router;
