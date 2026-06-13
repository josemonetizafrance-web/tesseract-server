const { getDefaultResponse, extractIdFromText } = require('../routes/helpers');

describe('Helper functions', () => {
  describe('extractIdFromText', () => {
    test('should extract numeric ID from text', () => {
      expect(extractIdFromText('User 123456789 has arrived')).toBe('123456789');
    });

    test('should return null if no ID found', () => {
      expect(extractIdFromText('No numbers here')).toBeNull();
    });

    test('should return null for short numbers', () => {
      expect(extractIdFromText('ID 12345')).toBeNull();
    });
  });

  describe('getDefaultResponse', () => {
    test('should return like response for like event', () => {
      const response = getDefaultResponse('like');
      expect(response).toBeTruthy();
      expect(typeof response).toBe('string');
    });

    test('should return wink response for wink event', () => {
      const response = getDefaultResponse('wink');
      expect(response).toBeTruthy();
    });
  });
});
