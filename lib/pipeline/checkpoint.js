/**
 * Pipeline Checkpoint Manager
 * Saves and restores pipeline state for resume support.
 */

const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const RESULTS_DIR = './results';

/**
 * Get checkpoint file path for a given date.
 * @param {string} [date] - ISO date string (YYYY-MM-DD). Defaults to today.
 * @returns {string}
 */
function getCheckpointPath(date) {
  const d = date || new Date().toISOString().slice(0, 10);
  return path.join(RESULTS_DIR, `.pipeline-checkpoint-${d}.json`);
}

/**
 * Create a new checkpoint.
 * @param {Object} options - Original pipeline options
 * @returns {Object} checkpoint object
 */
function createCheckpoint(options) {
  return {
    run_id: uuidv4(),
    started_at: new Date().toISOString(),
    options,
    stages: {
      discover: { status: 'pending' },
      eval: { status: 'pending' },
      generate: { status: 'pending' },
      run: { status: 'pending' },
      aggregate: { status: 'pending' },
      report: { status: 'pending' }
    },
    data: {}
  };
}

/**
 * Save checkpoint to disk.
 * @param {Object} checkpoint
 * @param {string} [date]
 */
async function saveCheckpoint(checkpoint, date) {
  await fs.ensureDir(RESULTS_DIR);
  const filePath = getCheckpointPath(date);
  await fs.writeJson(filePath, checkpoint, { spaces: 2 });
  return filePath;
}

/**
 * Load the most recent checkpoint.
 * Scans the results directory for checkpoint files and returns the newest one.
 * @returns {Promise<Object|null>} checkpoint or null if not found
 */
async function loadCheckpoint() {
  await fs.ensureDir(RESULTS_DIR);
  const files = await fs.readdir(RESULTS_DIR);
  const checkpoints = files
    .filter(f => f.startsWith('.pipeline-checkpoint-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (checkpoints.length === 0) return null;

  const filePath = path.join(RESULTS_DIR, checkpoints[0]);
  try {
    return await fs.readJson(filePath);
  } catch {
    return null;
  }
}

/**
 * Update a specific stage in the checkpoint.
 * @param {Object} checkpoint
 * @param {string} stage - Stage name (discover, eval, generate, run, aggregate, report)
 * @param {Object} update - Fields to merge into the stage
 * @param {string} [date]
 */
async function updateStage(checkpoint, stage, update, date) {
  if (!checkpoint.stages[stage]) {
    checkpoint.stages[stage] = {};
  }
  Object.assign(checkpoint.stages[stage], update);
  await saveCheckpoint(checkpoint, date);
  return checkpoint;
}

/**
 * Store intermediate data in the checkpoint.
 * @param {Object} checkpoint
 * @param {string} key
 * @param {*} value
 * @param {string} [date]
 */
async function storeData(checkpoint, key, value, date) {
  checkpoint.data[key] = value;
  await saveCheckpoint(checkpoint, date);
  return checkpoint;
}

/**
 * Check if a stage is completed.
 * @param {Object} checkpoint
 * @param {string} stage
 * @returns {boolean}
 */
function isStageCompleted(checkpoint, stage) {
  return checkpoint?.stages?.[stage]?.status === 'completed';
}

/**
 * Get skills that were already completed in a partially-done stage.
 * @param {Object} checkpoint
 * @param {string} stage
 * @returns {string[]} array of completed skill names
 */
function getCompletedSkills(checkpoint, stage) {
  return checkpoint?.stages?.[stage]?.skills_completed || [];
}

/**
 * Delete checkpoint file (called after successful pipeline completion).
 * @param {string} [date]
 */
async function clearCheckpoint(date) {
  const filePath = getCheckpointPath(date);
  try {
    await fs.remove(filePath);
  } catch {
    // ignore if file doesn't exist
  }
}

module.exports = {
  createCheckpoint,
  saveCheckpoint,
  loadCheckpoint,
  updateStage,
  storeData,
  isStageCompleted,
  getCompletedSkills,
  clearCheckpoint,
  getCheckpointPath
};
