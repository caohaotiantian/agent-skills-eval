/**
 * Reporting Module
 * Generates reports from evaluation results (OpenAI eval-skills framework)
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

/**
 * Generate report from evaluation results
 */
async function generateReport(options = {}) {
  const { input, format = 'html', output } = options;  
  if (!input) {
    throw new Error('Input file is required');
  }
  
  const results = await fs.readJson(input);
  
  let report;
  switch (format) {
    case 'json':
      report = JSON.stringify(results, null, 2);
      break;
    case 'markdown':
      report = results.pipeline
        ? generatePipelineMarkdownReport(results)
        : generateMarkdownReport(results);
      break;
    case 'html':
    default:
      report = results.pipeline
        ? generatePipelineHtmlReport(results)
        : generateHtmlReport(results);
  }
  
  const outputPath = output || 'report.' + format;
  await fs.writeFile(outputPath, report);
  console.log(chalk.green('Report generated: ' + outputPath));
}

function generateMarkdownReport(results) {
  let md = '# 📊 Agent Skills Evaluation Report\n\n';
  md += '**Run ID:** ' + results.run_id + '\n\n';
  md += '**Created:** ' + results.created_at + '\n\n';
  md += '## Summary\n\n';
  md += '- **Skills Evaluated:** ' + results.summary.stats.total_skills + '\n';
  md += '- **Evaluation Dimensions:** ' + results.summary.stats.total_evals + '\n';
  md += '- **Passed (>=70%):** ' + results.summary.stats.passed + '\n';
  md += '- **Needs Work (<70%):** ' + results.summary.stats.failed + '\n';
  md += '- **Average Score:** ' + results.summary.aggregate_scores.mean + '%\n\n';
  
  md += '## Evaluation Dimensions (OpenAI eval-skills)\n\n';
  md += '1. **Outcome Goals** - Task completion\n';
  md += '2. **Process Goals** - Follows expected steps\n';
  md += '3. **Style Goals** - Follows code conventions\n';
  md += '4. **Efficiency Goals** - Efficiency\n';
  md += '5. **Security Assessment** - Security assessment\n\n';
  
  md += '## Per-Skill Results\n\n';
  
  for (const skillId in results.data) {
    const skillData = results.data[skillId];
    const score = results.summary.scores[skillId].mean_score;
    
    md += '### ' + skillData.skill_name + ' (' + skillData.platform + ')\n\n';
    md += '**Overall Score:** ' + score + '%\n\n';
    
    for (const evalId in skillData.scores) {
      const evalResult = skillData.scores[evalId];
      md += '#### ' + evalResult.eval_name + ' (' + evalResult.percentage + '%)\n\n';
      md += evalResult.description + '\n\n';
      
      for (const criterion of evalResult.criteria_results) {
        const status = criterion.passed ? '✓' : '✗';
        md += '- **' + status + ' ' + criterion.name + '** (' + criterion.score + '/' + criterion.weight + ')\n';
        md += '  - Reasoning: ' + criterion.reasoning + '\n';
      }
      md += '\n';
    }
  }
  
  return md;
}

function generateHtmlReport(results) {
  let skillRows = '';
  let benchmarkRows = '';
  
  // Build benchmark summary
  const benchmarkStats = {};
  for (const skillId in results.data) {
    const skillData = results.data[skillId];
    for (const evalId in skillData.scores) {
      const evalResult = skillData.scores[evalId];
      if (!benchmarkStats[evalId]) {
        benchmarkStats[evalId] = { count: 0, total: 0, name: evalResult.eval_name };
      }
      benchmarkStats[evalId].count++;
      benchmarkStats[evalId].total += evalResult.percentage;
    }
  }
  
  for (const benchmarkId in benchmarkStats) {
    const stats = benchmarkStats[benchmarkId];
    const avg = Math.round(stats.total / stats.count);
    const color = avg >= 70 ? '#22c55e' : avg >= 50 ? '#eab308' : '#ef4444';
    benchmarkRows += '<tr><td>' + stats.name + '</td><td>' + stats.count + '</td><td style="color: ' + color + '; font-weight: bold;">' + avg + '%</td></tr>';
  }
  
  // Build skill rows with detailed reasoning
  for (const skillId in results.data) {
    const skillData = results.data[skillId];
    const score = results.summary.scores[skillId].mean_score;
    const color = score >= 70 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';
    
    skillRows += '<tr style="background: ' + color + '10%">';
    skillRows += '<td><strong>' + skillData.skill_name + '</strong><br><span style="font-size: 12px; color: #6b7280;">' + skillData.platform + '</span></td>';
    skillRows += '<td style="text-align: center;"><strong style="font-size: 24px; color: ' + color + ';">' + score + '%</strong></td>';
    skillRows += '<td>';
    
    for (const evalId in skillData.scores) {
      const evalResult = skillData.scores[evalId];
      const evalColor = evalResult.percentage >= 70 ? '#22c55e' : evalResult.percentage >= 50 ? '#eab308' : '#ef4444';
      
      skillRows += '<div style="margin-bottom: 15px; padding: 10px; background: #f9fafb; border-radius: 6px;">';
      skillRows += '<strong style="color: ' + evalColor + ';">' + evalResult.eval_name + ': ' + evalResult.percentage + '%</strong>';
      skillRows += '<p style="font-size: 12px; color: #6b7280; margin: 5px 0;">' + evalResult.description + '</p>';
      skillRows += '<ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 12px; color: #4b5563;">';
      
      for (const criterion of evalResult.criteria_results) {
        const statusIcon = criterion.passed ? '✓' : '✗';
        const statusColor = criterion.passed ? '#22c55e' : '#ef4444';
        skillRows += '<li style="margin-bottom: 4px;"><span style="color: ' + statusColor + ';">' + statusIcon + '</span> <strong>' + criterion.name + '</strong> (' + criterion.score + '/' + criterion.weight + ')<br>';
        skillRows += '<span style="color: #6b7280; font-style: italic;">' + criterion.reasoning + '</span></li>';
      }
      
      skillRows += '</ul></div>';
    }
    
    skillRows += '</td></tr>';
  }
  
  const html = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>📊 Agent Skills Evaluation Report</title>\n<style>\nbody { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; background: #f5f5f5; }\n.container { max-width: 1400px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }\nh1 { color: #1f2937; margin-bottom: 10px; }\nh2 { color: #374151; margin-top: 40px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }\nh3 { color: #4b5563; margin-top: 20px; }\n.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; margin: 30px 0; }\n.card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 10px; text-align: center; }\n.card h3 { margin: 0 0 10px 0; font-size: 14px; opacity: 0.9; color: white; }\n.card p { margin: 0; font-size: 32px; font-weight: bold; }\n.card.passed { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); }\n.card.failed { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); }\ntable { width: 100%; border-collapse: collapse; margin-top: 30px; }\nth { background: #f9fafb; padding: 15px; text-align: left; border-bottom: 2px solid #e5e7eb; }\ntd { padding: 15px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }\n.dimensions { background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; }\n.dimensions h3 { margin-top: 0; }\n.dimensions ul { margin: 0; padding-left: 20px; }\n.dimensions li { margin-bottom: 8px; }\n</style>\n</head>\n<body>\n<div class="container">\n<h1>📊 Agent Skills Evaluation Report</h1>\n<p style="color: #6b7280;">Run ID: ' + results.run_id + ' | Created: ' + results.created_at + '</p>\n\n<div class="dimensions">\n<h3>📐 Evaluation Dimensions (OpenAI eval-skills)</h3>\n<ul>\n<li><strong>1. Outcome Goals:</strong> Did the task complete? Does the application run?</li>\n<li><strong>2. Process Goals:</strong> Did the Agent invoke the skill and follow expected steps?</li>\n<li><strong>3. Style Goals:</strong> Does output follow agreed conventions?</li>\n<li><strong>4. Efficiency Goals:</strong> Completed efficiently? Any unnecessary waste?</li>\n<li><strong>5. Security Assessment:</strong> No hardcoded secrets, safe execution patterns</li>\n</ul>\n</div>\n\n<div class="summary">\n<div class="card">\n<h3>Total Skills</h3>\n<p>' + results.summary.stats.total_skills + '</p>\n</div>\n<div class="card">\n<h3>Dimensions</h3>\n<p>' + results.summary.stats.total_evals + '</p>\n</div>\n<div class="card passed">\n<h3>Secure (>=70%)</h3>\n<p>' + results.summary.stats.passed + '</p>\n</div>\n<div class="card failed">\n<h3>Needs Work (<70%)</h3>\n<p>' + results.summary.stats.failed + '</p>\n</div>\n<div class="card">\n<h3>Average Score</h3>\n<p>' + results.summary.aggregate_scores.mean + '%</p>\n</div>\n<div class="card">\n<h3>Median Score</h3>\n<p>' + results.summary.aggregate_scores.median + '%</p>\n</div>\n</div>\n\n<h2>📋 Detailed Results</h2>\n<table>\n<tr><th style="width: 20%;">Skill</th><th style="width: 10%; text-align: center;">Score</th><th style="width: 70%;">Evaluation Details & Reasoning</th></tr>\n' + skillRows + '\n</table>\n\n<h2 class="benchmark-summary">📊 Dimension Breakdown</h2>\n<table>\n<tr><th>Dimension</th><th>Skills Tested</th><th>Average Score</th></tr>\n' + benchmarkRows + '\n</table>\n\n</div>\n</body>\n</html>';
  
  return html;
}

function generatePipelineHtmlReport(results) {
  const staticEval = results.static_eval || {};
  const dynamicEval = results.dynamic_eval || {};
  const summary = results.summary || {};

  // --- Static section (reuse existing logic) ---
  let staticHtml = '';
  if (staticEval.data) {
    staticHtml = buildStaticSection(staticEval);
  }

  // --- Dynamic section ---
  let dynamicRows = '';
  for (const skill of (dynamicEval.skills || [])) {
    const passRate = skill.summary?.total
      ? Math.round((skill.summary.passed / skill.summary.total) * 100)
      : 0;
    const prColor = passRate >= 70 ? '#22c55e' : passRate >= 50 ? '#eab308' : '#ef4444';

    dynamicRows += '<tr>';
    dynamicRows += '<td><strong>' + skill.skillName + '</strong><br><span style="font-size:12px;color:#6b7280;">' + (skill.backend || '') + '</span></td>';
    dynamicRows += '<td style="text-align:center;"><strong style="font-size:24px;color:' + prColor + ';">' + passRate + '%</strong><br><span style="font-size:12px;">' + (skill.summary.passed || 0) + '/' + (skill.summary.total || 0) + '</span></td>';
    dynamicRows += '<td><ul style="margin:0;padding-left:18px;font-size:13px;">';

    for (const tm of (skill.traceMetrics || [])) {
      const icon = tm.passed ? '✓' : '✗';
      const iconColor = tm.passed ? '#22c55e' : '#ef4444';
      const thrashTag = tm.thrashing?.isThrashing
        ? '<span style="color:#ef4444;font-weight:bold;"> [THRASHING]</span>'
        : '';
      dynamicRows += '<li style="margin-bottom:4px;"><span style="color:' + iconColor + ';">' + icon + '</span> ' + tm.testId + ' — cmds: ' + tm.commandCount + ', errors: ' + tm.errorCount + ', efficiency: ' + (tm.efficiencyScore != null ? tm.efficiencyScore + '%' : 'N/A') + thrashTag + '</li>';
    }

    dynamicRows += '</ul></td></tr>';
  }

  const html = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>Pipeline Evaluation Report</title>\n<style>\nbody{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:40px;background:#f5f5f5;}\n.container{max-width:1400px;margin:0 auto;background:white;padding:40px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.1);}\nh1{color:#1f2937;}\nh2{color:#374151;margin-top:40px;border-bottom:2px solid #e5e7eb;padding-bottom:10px;}\n.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:20px;margin:30px 0;}\n.card{color:white;padding:25px;border-radius:10px;text-align:center;}\n.card h3{margin:0 0 10px;font-size:14px;opacity:.9;color:white;}\n.card p{margin:0;font-size:32px;font-weight:bold;}\n.card.blue{background:linear-gradient(135deg,#667eea,#764ba2);}\n.card.green{background:linear-gradient(135deg,#22c55e,#16a34a);}\n.card.red{background:linear-gradient(135deg,#ef4444,#dc2626);}\n.card.purple{background:linear-gradient(135deg,#8b5cf6,#6d28d9);}\ntable{width:100%;border-collapse:collapse;margin-top:20px;}\nth{background:#f9fafb;padding:12px;text-align:left;border-bottom:2px solid #e5e7eb;}\ntd{padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top;}\n</style>\n</head>\n<body>\n<div class="container">\n<h1>Pipeline Evaluation Report</h1>\n<p style="color:#6b7280;">Run: ' + results.run_id + ' | ' + results.created_at + '</p>\n\n<div class="summary">\n  <div class="card blue"><h3>Skills Evaluated</h3><p>' + (summary.total_skills_evaluated || 0) + '</p></div>\n  <div class="card purple"><h3>Static Score</h3><p>' + (summary.static_score != null ? summary.static_score + '%' : 'N/A') + '</p></div>\n  <div class="card green"><h3>Dynamic Pass Rate</h3><p>' + (summary.dynamic_pass_rate != null ? summary.dynamic_pass_rate + '%' : 'N/A') + '</p></div>\n  <div class="card blue"><h3>Dynamic Tests</h3><p>' + (summary.total_dynamic_tests || 0) + '</p></div>\n  <div class="card ' + ((dynamicEval.thrashing_count || 0) > 0 ? 'red' : 'green') + '"><h3>Thrashing</h3><p>' + (dynamicEval.thrashing_count || 0) + '</p></div>\n  <div class="card blue"><h3>Total Tokens</h3><p>' + (dynamicEval.total_tokens || 0).toLocaleString() + '</p></div>\n</div>\n\n<h2>Static Evaluation</h2>\n' + staticHtml + '\n\n<h2>Dynamic Execution Results</h2>\n<table>\n<tr><th style="width:20%;">Skill</th><th style="width:15%;text-align:center;">Pass Rate</th><th>Trace Metrics</th></tr>\n' + dynamicRows + '\n</table>\n\n</div>\n</body>\n</html>';

  return html;
}

/**
 * Build the static eval HTML section (extracted from existing logic for reuse).
 */
function buildStaticSection(staticEval) {
  let skillRows = '';
  for (const skillId in staticEval.data) {
    const skillData = staticEval.data[skillId];
    const score = staticEval.summary?.scores?.[skillId]?.mean_score ?? '?';
    const color = score >= 70 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';

    skillRows += '<tr style="background:' + color + '10%">';
    skillRows += '<td><strong>' + skillData.skill_name + '</strong><br><span style="font-size:12px;color:#6b7280;">' + skillData.platform + '</span></td>';
    skillRows += '<td style="text-align:center;"><strong style="font-size:24px;color:' + color + ';">' + score + '%</strong></td>';
    skillRows += '<td>';

    for (const evalId in skillData.scores) {
      const evalResult = skillData.scores[evalId];
      const eColor = evalResult.percentage >= 70 ? '#22c55e' : evalResult.percentage >= 50 ? '#eab308' : '#ef4444';
      skillRows += '<div style="margin-bottom:12px;padding:8px;background:#f9fafb;border-radius:6px;">';
      skillRows += '<strong style="color:' + eColor + ';">' + evalResult.eval_name + ': ' + evalResult.percentage + '%</strong>';
      skillRows += '<ul style="margin:6px 0 0;padding-left:18px;font-size:12px;">';
      for (const c of (evalResult.criteria_results || [])) {
        const cIcon = c.passed ? '✓' : '✗';
        const cColor = c.passed ? '#22c55e' : '#ef4444';
        skillRows += '<li><span style="color:' + cColor + ';">' + cIcon + '</span> ' + c.name + ' (' + c.score + '/' + c.weight + ')</li>';
      }
      skillRows += '</ul></div>';
    }
    skillRows += '</td></tr>';
  }

  return '<table><tr><th style="width:20%;">Skill</th><th style="width:10%;text-align:center;">Score</th><th>Evaluation Details</th></tr>' + skillRows + '</table>';
}

function generatePipelineMarkdownReport(results) {
  const summary = results.summary || {};
  const staticEval = results.static_eval || {};
  const dynamicEval = results.dynamic_eval || {};

  let md = '# Pipeline Evaluation Report\n\n';
  md += '**Run ID:** ' + results.run_id + '\n';
  md += '**Created:** ' + results.created_at + '\n\n';
  md += '## Summary\n\n';
  md += '| Metric | Value |\n|--------|-------|\n';
  md += '| Static Score | ' + (summary.static_score != null ? summary.static_score + '%' : 'N/A') + ' |\n';
  md += '| Dynamic Pass Rate | ' + (summary.dynamic_pass_rate != null ? summary.dynamic_pass_rate + '%' : 'N/A') + ' |\n';
  md += '| Skills Evaluated | ' + (summary.total_skills_evaluated || 0) + ' |\n';
  md += '| Dynamic Tests | ' + (summary.total_dynamic_tests || 0) + ' |\n';
  md += '| Total Tokens | ' + (dynamicEval.total_tokens || 0) + ' |\n';
  md += '| Thrashing Instances | ' + (dynamicEval.thrashing_count || 0) + ' |\n\n';

  // Static eval section
  if (staticEval.data) {
    md += '## Static Evaluation\n\n';
    for (const skillId in staticEval.data) {
      const sd = staticEval.data[skillId];
      const score = staticEval.summary?.scores?.[skillId]?.mean_score ?? '?';
      md += '### ' + sd.skill_name + ' (' + sd.platform + ') — ' + score + '%\n\n';
      for (const evalId in sd.scores) {
        const er = sd.scores[evalId];
        md += '**' + er.eval_name + ': ' + er.percentage + '%**\n';
        for (const c of (er.criteria_results || [])) {
          md += '- ' + (c.passed ? '✓' : '✗') + ' ' + c.name + ' (' + c.score + '/' + c.weight + ')\n';
        }
        md += '\n';
      }
    }
  }

  // Dynamic section
  if (dynamicEval.skills?.length) {
    md += '## Dynamic Execution\n\n';
    for (const skill of dynamicEval.skills) {
      const pr = skill.summary?.total
        ? Math.round((skill.summary.passed / skill.summary.total) * 100)
        : 0;
      md += '### ' + skill.skillName + ' (' + (skill.backend || '') + ') — ' + pr + '% pass rate\n\n';
      md += '| Test | Status | Commands | Errors | Efficiency | Thrashing |\n';
      md += '|------|--------|----------|--------|------------|----------|\n';
      for (const tm of (skill.traceMetrics || [])) {
        md += '| ' + tm.testId + ' | ' + (tm.passed ? '✓' : '✗') + ' | ' + tm.commandCount + ' | ' + tm.errorCount + ' | ' + (tm.efficiencyScore != null ? tm.efficiencyScore + '%' : 'N/A') + ' | ' + (tm.thrashing?.isThrashing ? 'YES' : 'No') + ' |\n';
      }
      md += '\n';
    }
  }

  return md;
}

module.exports = { generateReport };
