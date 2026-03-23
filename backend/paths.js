import { join } from 'path';

/**
 * Generates structured paths for a clip based on the project hierarchy.
 *
 * Directory structure:
 *   {base}/episode-{NN}/{scene-name}/{clip-name}/
 *     iterations/   — iteration JSON files
 *     renders/      — rendered MP4 files
 *     frames/       — extracted frame PNGs
 *     LOCKED/       — production-locked files
 *
 * @param {object} config - App config (needs project_base_dir or iteration_save_dir)
 * @param {object} clip - Clip record (needs .name)
 * @param {object} scene - Scene record (needs .name, .episode)
 * @returns {object} Path helpers for the clip's directory structure
 */
export function getClipPaths(config, clip, scene) {
  const safeName = (name) =>
    name
      .replace(/[—–]/g, '-')           // em-dash/en-dash to hyphen
      .replace(/[^a-zA-Z0-9\-. ]/g, '') // strip everything else except alphanumeric, hyphen, dot, space
      .replace(/\s+/g, '-')             // spaces to hyphens
      .replace(/-+/g, '-')              // collapse multiple hyphens
      .replace(/^-|-$/g, '')            // trim leading/trailing hyphens
      .toLowerCase();

  const base = config.project_base_dir || config.iteration_save_dir;
  const episodeDir = `episode-${String(scene.episode || 1).padStart(2, '0')}`;
  const sceneDir = safeName(scene.name);
  const clipDir = safeName(clip.name);

  const clipBase = join(base, episodeDir, sceneDir, clipDir);

  return {
    clipBase,
    iterations: join(clipBase, 'iterations'),
    renders: join(clipBase, 'renders'),
    frames: join(clipBase, 'frames'),
    seedScreening: join(clipBase, 'seed-screening'),
    locked: join(clipBase, 'LOCKED'),
    iterationFile: (num) =>
      join(clipBase, 'iterations', `${safeName(clip.name)}_iter_${String(num).padStart(2, '0')}.json`),
    renderFile: (num) =>
      join(clipBase, 'renders', `${safeName(clip.name)}_iter_${String(num).padStart(2, '0')}.mp4`),
  };
}
