import express from 'express';
import cors from 'cors';
import { createStore } from '../store/index.js';
import { createProjectRoutes } from '../routes/projects.js';
import { createClipRoutes } from '../routes/clips.js';
import { createIterationRoutes } from '../routes/iterations.js';
import { createCharacterRoutes } from '../routes/characters.js';
import { createTemplateRoutes } from '../routes/templates.js';
import { createSeedScreenRoutes } from '../routes/seedscreen.js';
import { createBranchRoutes, createBranchIterationRoutes } from '../routes/branches.js';
import { createTelemetry } from '../telemetry/index.js';
import { createTelemetryRoutes } from '../routes/telemetry.js';

export function createTestApp(dataDir, config = {}) {
  const store = createStore(dataDir);
  const telemetry = createTelemetry(store, config);
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.use('/api/projects', createProjectRoutes(store));
  app.use('/api/clips', createClipRoutes(store));
  app.use('/api/iterations', createIterationRoutes(store, config, telemetry));
  app.use('/api/characters', createCharacterRoutes(store));
  app.use('/api/templates', createTemplateRoutes(store));
  app.use('/api/clips', createSeedScreenRoutes(store, config));
  app.use('/api/clips', createBranchRoutes(store, config));
  app.use('/api/branches', createBranchIterationRoutes(store));
  app.use('/api/telemetry', createTelemetryRoutes(telemetry, config));

  return { app, store, telemetry };
}
