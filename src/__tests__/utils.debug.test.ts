import { describe, it, expect, vi, beforeEach } from 'vitest';
import { debug } from '../utils/debug';

type LoggerFn = (message: string, data?: unknown) => void;

describe('debug utility', () => {
  let customLogger: LoggerFn & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    customLogger = vi.fn() as unknown as LoggerFn & ReturnType<typeof vi.fn>;
  });

  describe('debug.log', () => {
    it('does not log when debug is disabled', () => {
      debug.log({ enabled: false }, 'test message');
      expect(customLogger).not.toHaveBeenCalled();
    });

    it('does not log when debug options are undefined', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      debug.log(undefined, 'test message');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('logs when debug is enabled with default logger', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      debug.log({ enabled: true }, 'test message');
      expect(consoleSpy).toHaveBeenCalledWith('[@omnisearch] test message');
      consoleSpy.mockRestore();
    });

    it('logs message and data when debug is enabled with default logger', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const data = { key: 'value' };
      debug.log({ enabled: true }, 'test message', data);
      expect(consoleSpy).toHaveBeenCalledWith('[@omnisearch] test message', data);
      consoleSpy.mockRestore();
    });

    it('uses custom logger function when provided', () => {
      debug.log({ enabled: true, logger: customLogger }, 'test message', { extra: 'data' });
      expect(customLogger).toHaveBeenCalledWith('test message', { extra: 'data' });
    });

    it('uses custom logger without data', () => {
      debug.log({ enabled: true, logger: customLogger }, 'simple message');
      expect(customLogger).toHaveBeenCalledWith('simple message', undefined);
    });

    it('merges options with defaults', () => {
      // Only enabled is set, other options should use defaults
      debug.log({ enabled: true, logger: customLogger }, 'merged');
      expect(customLogger).toHaveBeenCalled();
    });

    it('swallows errors thrown by a custom logger', () => {
      const throwingLogger = vi.fn().mockImplementation(() => {
        throw new Error('logger failure');
      });
      // Should not throw even though the logger throws
      expect(() => debug.log({ enabled: true, logger: throwingLogger }, 'msg')).not.toThrow();
    });
  });

  describe('debug.logRequest', () => {
    it('does not log when debug is disabled', () => {
      debug.logRequest({ enabled: false, logRequests: true }, 'request', {});
      expect(customLogger).not.toHaveBeenCalled();
    });

    it('does not log when logRequests is false', () => {
      debug.logRequest({ enabled: true, logRequests: false, logger: customLogger }, 'request', {});
      expect(customLogger).not.toHaveBeenCalled();
    });

    it('does not log when debug options are undefined', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      debug.logRequest(undefined, 'request message');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('logs request when both enabled and logRequests are true', () => {
      debug.logRequest({ enabled: true, logRequests: true, logger: customLogger }, 'API request', {
        url: 'https://example.com',
      });
      expect(customLogger).toHaveBeenCalledWith('REQUEST: API request', {
        url: 'https://example.com',
      });
    });

    it('prefixes message with REQUEST:', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      debug.logRequest({ enabled: true, logRequests: true }, 'my request');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('REQUEST: my request'));
      consoleSpy.mockRestore();
    });
  });

  describe('debug.logResponse', () => {
    it('does not log when debug is disabled', () => {
      debug.logResponse({ enabled: false, logResponses: true }, 'response', {});
      expect(customLogger).not.toHaveBeenCalled();
    });

    it('does not log when logResponses is false', () => {
      debug.logResponse(
        { enabled: true, logResponses: false, logger: customLogger },
        'response',
        {}
      );
      expect(customLogger).not.toHaveBeenCalled();
    });

    it('does not log when debug options are undefined', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      debug.logResponse(undefined, 'response message');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('logs response when both enabled and logResponses are true', () => {
      debug.logResponse(
        { enabled: true, logResponses: true, logger: customLogger },
        'API response',
        { status: 200 }
      );
      expect(customLogger).toHaveBeenCalledWith('RESPONSE: API response', { status: 200 });
    });

    it('prefixes message with RESPONSE:', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      debug.logResponse({ enabled: true, logResponses: true }, 'my response');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('RESPONSE: my response'));
      consoleSpy.mockRestore();
    });
  });
});
