import { createBraveProvider } from './src/providers/brave';
import { vi } from 'vitest';

async function test() {
  const body = { message: 'Unauthorized' };
  const bodyStr = JSON.stringify(body);
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(bodyStr),
    clone: vi.fn().mockReturnValue({ text: vi.fn().mockResolvedValue(bodyStr) }),
    headers: new Headers({ 'content-type': 'application/json' })
  }) as any;

  const provider = createBraveProvider({ apiKey: 'test-key' });
  const result = await provider.search({ query: 'test', retries: 0 });
  
  if (result.isErr()) {
    console.log('Error Message:', result.error.message);
  } else {
    console.log('Success');
  }
}

test();
