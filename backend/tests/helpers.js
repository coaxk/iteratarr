import express from 'express';
import cors from 'cors';
import { createStore } from '../store/index.js';
import { createProjectRoutes } from '../routes/projects.js';
import { createClipRoutes } from '../routes/clips.js';
import { createIterationRoutes } from '../routes/iterations.js';
import { createCharacterRoutes } from '../routes/characters.js';

export function createTestApp(dataDir, config = {}) {
  const store = createStore(dataDir);
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.use('/api/projects', createProjectRoutes(store));
  app.use('/api/clips', createClipRoutes(store));
  app.use('/api/iterations', createIterationRoutes(store, config));
  app.use('/api/characters', createCharacterRoutes(store));

  return { app, store };
}
