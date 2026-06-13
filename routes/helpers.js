function extractIdFromText(text) {
  if (!text) return null;
  const match = text.match(/\b(\d{6,15})\b/);
  return match ? match[1] : null;
}

function getDefaultResponse(eventType) {
  const defaults = {
    like: 'Thanks for the like! How are you?',
    wink: 'Hey! Got your wink. How are you?',
    comment: 'Thanks for the comment!',
    gift: 'Wow, thanks for the gift!'
  };
  return defaults[eventType] || 'Hello!';
}

module.exports = { extractIdFromText, getDefaultResponse };
