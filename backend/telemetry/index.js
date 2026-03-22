/**
 * Telemetry Foundation — Iteratarr
 *
 * Opt-in only. Off by default. Hooks in place from day 1.
 *
 * Records evaluation scores, rope attributions, AI vs human score deltas,
 * and generation settings for future community analytics. No prompts, no
 * file paths, no character names in exports — see anonymizer.js.
 *
 * Usage:
 *   const telemetry = createTelemetry(store, config);
 *   telemetry.record(EVENTS.EVALUATION_SAVED, { scores, attribution, ... });
 */

import { anonymizeEvents } from './anonymizer.js';

// Telemetry event types
export const EVENTS = {
  EVALUATION_SAVED: 'evaluation_saved',
  ITERATION_GENERATED: 'iteration_generated',
  ITERATION_LOCKED: 'iteration_locked',
  CHARACTER_CREATED: 'character_created',
  ROPE_ATTRIBUTED: 'rope_attributed'
};

const TELEMETRY_COLLECTION = 'telemetry_events';
const APP_VERSION = '0.1.0';

/**
 * Creates a telemetry instance backed by the existing SQLite store.
 *
 * @param {object} store - The Iteratarr store (from store/index.js)
 * @param {object} config - App config; reads `telemetry_enabled` (default false)
 * @returns {object} Telemetry API: { record, getEvents, exportAnonymized, isEnabled, setEnabled }
 */
export function createTelemetry(store, config) {
  // Telemetry state — mutable so toggle endpoint can flip it at runtime
  let enabled = config.telemetry_enabled === true;

  return {
    /**
     * Records a telemetry event if telemetry is enabled.
     * No-op when disabled — zero overhead.
     *
     * @param {string} eventType - One of EVENTS.*
     * @param {object} data - Event-specific payload (scores, attribution, settings, etc.)
     */
    async record(eventType, data = {}) {
      if (!enabled) return null;

      const event = {
        event_type: eventType,
        timestamp: new Date().toISOString(),
        app_version: APP_VERSION,
        payload: data
      };

      try {
        return await store.create(TELEMETRY_COLLECTION, event);
      } catch (err) {
        // Telemetry must never break the app — swallow errors, log to console
        console.error(`[Telemetry] Failed to record ${eventType}:`, err.message);
        return null;
      }
    },

    /**
     * Queries recorded telemetry events.
     *
     * @param {object} filters - Optional filters: { event_type, since, limit }
     * @returns {Array} Matching events
     */
    async getEvents(filters = {}) {
      try {
        let events = await store.list(TELEMETRY_COLLECTION);

        if (filters.event_type) {
          events = events.filter(e => e.event_type === filters.event_type);
        }

        if (filters.since) {
          const sinceDate = new Date(filters.since);
          events = events.filter(e => new Date(e.timestamp) >= sinceDate);
        }

        // Sort newest first
        events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (filters.limit) {
          events = events.slice(0, filters.limit);
        }

        return events;
      } catch (err) {
        console.error('[Telemetry] Failed to query events:', err.message);
        return [];
      }
    },

    /**
     * Exports all telemetry data with PII stripped.
     * Safe for community sharing — no file paths, no prompts, no character names.
     *
     * @returns {object} { event_count, exported_at, events: [...anonymized] }
     */
    async exportAnonymized() {
      try {
        const events = await store.list(TELEMETRY_COLLECTION);
        const anonymized = anonymizeEvents(events);

        return {
          event_count: anonymized.length,
          exported_at: new Date().toISOString(),
          app_version: APP_VERSION,
          events: anonymized
        };
      } catch (err) {
        console.error('[Telemetry] Failed to export:', err.message);
        return { event_count: 0, exported_at: new Date().toISOString(), app_version: APP_VERSION, events: [] };
      }
    },

    /**
     * Returns whether telemetry is currently enabled.
     */
    isEnabled() {
      return enabled;
    },

    /**
     * Enables or disables telemetry at runtime.
     * Called by the toggle endpoint.
     */
    setEnabled(value) {
      enabled = value === true;
      return enabled;
    }
  };
}
