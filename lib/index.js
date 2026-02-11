/**
 * Agent Skills Evaluation Tool - Main Entry Point
 */

const discovering = require('./skills/discovering');
const evaluating = require('./skills/evaluating');
const reporting = require('./skills/reporting');
const benchmarking = require('./skills/benchmarking');

module.exports = {
  discovering,
  evaluating,
  reporting,
  benchmarking
};
