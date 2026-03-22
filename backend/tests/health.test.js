import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { app } from '../server.js';

describe('Health endpoint', () => {
  it('GET /api/health returns ok', async () => {
    const res = await supertest(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
