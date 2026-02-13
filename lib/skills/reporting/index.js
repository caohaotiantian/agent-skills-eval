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
      if (results.pipeline && results.comparison) {
        report = generateConsolidatedMarkdownReport(results);
      } else if (results.pipeline) {
        report = generatePipelineMarkdownReport(results);
      } else {
        report = generateMarkdownReport(results);
      }
      break;
    case 'html':
    default:
      if (results.pipeline && results.comparison) {
        report = generateConsolidatedHtmlReport(results);
      } else if (results.pipeline) {
        report = generatePipelineHtmlReport(results);
      } else {
        report = generateHtmlReport(results);
      }
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

function generateConsolidatedHtmlReport(results) {
  const staticEval = results.static_eval || {};
  const dynamicEval = results.dynamic_eval || {};
  const comparison = results.comparison || {};
  const summary = results.summary || {};
  const rankings = comparison.rankings || [];

  // --- Executive Summary Cards ---
  const cards = [
    { label: 'Skills Evaluated', value: summary.total_skills_evaluated || 0, cls: 'blue' },
    { label: 'Static Score', value: (summary.static_score != null ? summary.static_score + '%' : 'N/A'), cls: 'purple' },
    { label: 'Dynamic Pass Rate', value: (summary.dynamic_pass_rate != null ? summary.dynamic_pass_rate + '%' : 'N/A'), cls: 'green' },
    { label: 'Composite Score', value: (summary.average_composite_score != null ? summary.average_composite_score + '%' : 'N/A'), cls: 'blue' },
    { label: 'Dynamic Tests', value: summary.total_dynamic_tests || 0, cls: 'blue' },
    { label: 'Avg Efficiency', value: (comparison.averageEfficiency != null ? comparison.averageEfficiency + '%' : 'N/A'), cls: 'purple' },
    { label: 'Thrashing', value: comparison.totalThrashingIncidents || 0, cls: (comparison.totalThrashingIncidents || 0) > 0 ? 'red' : 'green' },
    { label: 'Total Tokens', value: comparison.totalTokensUsed ? comparison.totalTokensUsed.toLocaleString() : 'N/A', cls: 'blue' }
  ];
  let cardsHtml = '';
  for (const c of cards) {
    cardsHtml += '<div class="card ' + c.cls + '"><h3>' + c.label + '</h3><p>' + c.value + '</p></div>\n';
  }

  // --- Skill Comparison Table ---
  let comparisonRows = '';
  for (const r of rankings) {
    const sColor = (r.staticScore ?? 0) >= 70 ? '#22c55e' : (r.staticScore ?? 0) >= 50 ? '#eab308' : '#ef4444';
    const dColor = r.dynamicPassRate >= 70 ? '#22c55e' : r.dynamicPassRate >= 50 ? '#eab308' : '#ef4444';
    const eColor = (r.efficiencyAvg ?? 0) >= 70 ? '#22c55e' : (r.efficiencyAvg ?? 0) >= 50 ? '#eab308' : '#ef4444';
    const cColor = r.compositeScore >= 70 ? '#22c55e' : r.compositeScore >= 50 ? '#eab308' : '#ef4444';
    const thrashBadge = r.thrashingCount > 0
      ? '<span style="background:#fef2f2;color:#ef4444;padding:2px 8px;border-radius:10px;font-size:11px;">Yes (' + r.thrashingCount + ')</span>'
      : '<span style="background:#f0fdf4;color:#22c55e;padding:2px 8px;border-radius:10px;font-size:11px;">No</span>';

    comparisonRows += '<tr>';
    comparisonRows += '<td style="text-align:center;font-weight:bold;font-size:18px;color:#6b7280;">#' + r.rank + '</td>';
    comparisonRows += '<td><strong>' + r.skillName + '</strong></td>';
    comparisonRows += '<td style="text-align:center;color:' + sColor + ';font-weight:bold;">' + (r.staticScore != null ? r.staticScore + '%' : 'N/A') + '</td>';
    comparisonRows += '<td style="text-align:center;color:' + dColor + ';font-weight:bold;">' + r.dynamicPassRate + '%<br><span style="font-size:11px;color:#6b7280;">' + r.passedCount + '/' + r.testCount + '</span></td>';
    comparisonRows += '<td style="text-align:center;color:' + eColor + ';font-weight:bold;">' + (r.efficiencyAvg != null ? r.efficiencyAvg + '%' : 'N/A') + '</td>';
    comparisonRows += '<td style="text-align:center;">' + (r.totalTokens ? r.totalTokens.toLocaleString() : 'N/A') + '</td>';
    comparisonRows += '<td style="text-align:center;">' + thrashBadge + '</td>';
    comparisonRows += '<td style="text-align:center;"><strong style="font-size:20px;color:' + cColor + ';">' + r.compositeScore + '</strong></td>';
    comparisonRows += '</tr>';
  }

  // --- Ranking Bars ---
  let rankingBars = '';
  const maxComposite = rankings.length > 0 ? Math.max(...rankings.map(r => r.compositeScore), 1) : 1;
  for (const r of rankings) {
    const pct = Math.round((r.compositeScore / maxComposite) * 100);
    const barColor = r.compositeScore >= 70 ? '#22c55e' : r.compositeScore >= 50 ? '#eab308' : '#ef4444';
    rankingBars += '<div style="display:flex;align-items:center;margin-bottom:8px;">';
    rankingBars += '<div style="width:180px;font-weight:500;font-size:13px;color:#374151;">#' + r.rank + ' ' + r.skillName + '</div>';
    rankingBars += '<div style="flex:1;background:#f3f4f6;border-radius:6px;height:24px;overflow:hidden;">';
    rankingBars += '<div style="width:' + pct + '%;background:' + barColor + ';height:100%;border-radius:6px;transition:width .3s;"></div>';
    rankingBars += '</div>';
    rankingBars += '<div style="width:60px;text-align:right;font-weight:bold;font-size:14px;color:' + barColor + ';">' + r.compositeScore + '</div>';
    rankingBars += '</div>';
  }

  // --- Per-Skill Detail Panels ---
  let detailPanels = '';
  for (const skill of (dynamicEval.skills || [])) {
    const rankInfo = rankings.find(r => r.skillName === skill.skillName);
    const passRate = skill.summary?.total
      ? Math.round((skill.summary.passed / skill.summary.total) * 100) : 0;
    const prColor = passRate >= 70 ? '#22c55e' : passRate >= 50 ? '#eab308' : '#ef4444';

    detailPanels += '<div class="detail-panel">';
    detailPanels += '<div class="detail-header" onclick="this.parentElement.classList.toggle(\'open\')">';
    detailPanels += '<span style="font-size:18px;font-weight:bold;">' + skill.skillName + '</span>';
    detailPanels += '<span style="margin-left:auto;display:flex;gap:16px;align-items:center;">';
    if (rankInfo) {
      detailPanels += '<span style="font-size:13px;color:#6b7280;">Rank #' + rankInfo.rank + '</span>';
      detailPanels += '<span style="font-size:13px;color:#6b7280;">Composite: <strong style="color:' + prColor + ';">' + rankInfo.compositeScore + '</strong></span>';
    }
    detailPanels += '<span style="color:' + prColor + ';font-weight:bold;">' + passRate + '% pass</span>';
    detailPanels += '<span class="chevron">&#9660;</span>';
    detailPanels += '</span></div>';

    detailPanels += '<div class="detail-body">';

    // Static eval for this skill
    if (staticEval.data) {
      const matchedKey = Object.keys(staticEval.data).find(k =>
        k.toLowerCase().includes(skill.skillName.toLowerCase()) ||
        skill.skillName.toLowerCase().includes(k.toLowerCase())
      );
      if (matchedKey) {
        const sd = staticEval.data[matchedKey];
        const score = staticEval.summary?.scores?.[matchedKey]?.mean_score ?? '?';
        detailPanels += '<h4>Static Evaluation (' + score + '%)</h4>';
        for (const evalId in sd.scores) {
          const er = sd.scores[evalId];
          const eColor = er.percentage >= 70 ? '#22c55e' : er.percentage >= 50 ? '#eab308' : '#ef4444';
          detailPanels += '<div style="margin-bottom:8px;padding:8px;background:#f9fafb;border-radius:6px;">';
          detailPanels += '<strong style="color:' + eColor + ';">' + er.eval_name + ': ' + er.percentage + '%</strong>';
          detailPanels += '<ul style="margin:4px 0 0;padding-left:18px;font-size:12px;">';
          for (const c of (er.criteria_results || [])) {
            const cIcon = c.passed ? '&#10003;' : '&#10007;';
            const cColor = c.passed ? '#22c55e' : '#ef4444';
            detailPanels += '<li><span style="color:' + cColor + ';">' + cIcon + '</span> ' + c.name + ' (' + c.score + '/' + c.weight + ')</li>';
          }
          detailPanels += '</ul></div>';
        }
      }
    }

    // Dynamic per-test cases with expandable detail
    detailPanels += '<h4>Dynamic Test Cases</h4>';
    detailPanels += '<p style="font-size:12px;color:#9ca3af;margin:4px 0 12px;">Click a test case to see prompt, agent response, and tool calls.</p>';
    for (const tm of (skill.traceMetrics || [])) {
      const statusIcon = tm.passed ? '<span style="color:#22c55e;">&#10003; Pass</span>' : '<span style="color:#ef4444;">&#10007; Fail</span>';
      const thrashTag = tm.thrashing?.isThrashing
        ? '<span style="background:#fef2f2;color:#ef4444;padding:1px 6px;border-radius:8px;font-size:10px;">THRASHING</span>'
        : '';
      const tokenDisplay = (tm.tokenUsage?.total != null) ? tm.tokenUsage.total.toLocaleString() : 'N/A';
      const catBadge = tm.category
        ? '<span style="background:#eef2ff;color:#4f46e5;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:6px;">' + tm.category + '</span>'
        : '';

      // Test case header row (clickable)
      detailPanels += '<div class="test-case-panel">';
      detailPanels += '<div class="test-case-header" onclick="this.parentElement.classList.toggle(\'open\')">';
      detailPanels += '<span style="display:flex;align-items:center;gap:8px;">' + statusIcon + ' <strong>' + tm.testId + '</strong>' + catBadge + ' ' + thrashTag + '</span>';
      detailPanels += '<span style="display:flex;gap:16px;align-items:center;font-size:12px;color:#6b7280;">';
      detailPanels += '<span>Cmds: ' + tm.commandCount + '</span>';
      detailPanels += '<span>Errors: ' + tm.errorCount + '</span>';
      detailPanels += '<span>Eff: ' + (tm.efficiencyScore != null ? tm.efficiencyScore + '%' : 'N/A') + '</span>';
      detailPanels += '<span>Tokens: ' + tokenDisplay + '</span>';
      detailPanels += '<span class="chevron" style="font-size:10px;">&#9660;</span>';
      detailPanels += '</span></div>';

      // Expandable detail body
      detailPanels += '<div class="test-case-body">';

      // Prompt
      if (tm.prompt) {
        const escapedPrompt = String(tm.prompt).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        detailPanels += '<div class="trace-section">';
        detailPanels += '<div class="trace-section-title">Prompt</div>';
        detailPanels += '<div class="trace-prompt">' + escapedPrompt + '</div>';
        detailPanels += '</div>';
      }

      // Thrashing detail
      if (tm.thrashing?.isThrashing) {
        detailPanels += '<div class="trace-section" style="border-left-color:#ef4444;">';
        detailPanels += '<div class="trace-section-title" style="color:#ef4444;">Thrashing Detected</div>';
        detailPanels += '<div style="font-size:12px;color:#6b7280;">' + (tm.thrashing.reason || 'Same command repeated excessively') + '</div>';
        if (tm.thrashing.command) {
          detailPanels += '<code style="display:block;margin-top:4px;padding:6px;background:#fef2f2;border-radius:4px;font-size:11px;color:#b91c1c;word-break:break-all;">' + String(tm.thrashing.command).replace(/</g, '&lt;').substring(0, 200) + '</code>';
        }
        detailPanels += '</div>';
      }

      // Trace details (tool calls, messages, errors)
      const td = tm.traceDetails;
      if (td) {
        // Agent messages
        if (td.messages && td.messages.length > 0) {
          detailPanels += '<div class="trace-section">';
          detailPanels += '<div class="trace-section-title">Agent Messages (' + td.messages.length + ')</div>';
          for (const msg of td.messages) {
            const escapedContent = String(msg.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const truncated = escapedContent.length > 500 ? escapedContent.substring(0, 500) + '...' : escapedContent;
            detailPanels += '<div class="trace-message">' + truncated + '</div>';
          }
          detailPanels += '</div>';
        }

        // Tool calls timeline
        if (td.toolCalls && td.toolCalls.length > 0) {
          detailPanels += '<div class="trace-section">';
          detailPanels += '<div class="trace-section-title">Tool Calls (' + td.toolCalls.length + ')</div>';
          detailPanels += '<div class="tool-timeline">';
          for (const tc of td.toolCalls) {
            const inputStr = tc.input ? JSON.stringify(tc.input) : '';
            const truncInput = inputStr.length > 200 ? inputStr.substring(0, 200) + '...' : inputStr;
            const escapedInput = truncInput.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            detailPanels += '<div class="tool-call-item">';
            detailPanels += '<span class="tool-name">' + (tc.tool || 'unknown') + '</span>';
            if (escapedInput) {
              detailPanels += '<code class="tool-input">' + escapedInput + '</code>';
            }
            detailPanels += '</div>';
          }
          detailPanels += '</div></div>';
        }

        // Errors
        if (td.errors && td.errors.length > 0) {
          detailPanels += '<div class="trace-section" style="border-left-color:#ef4444;">';
          detailPanels += '<div class="trace-section-title" style="color:#ef4444;">Errors (' + td.errors.length + ')</div>';
          for (const err of td.errors) {
            const escapedErr = String(err.message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            detailPanels += '<div class="trace-error">' + err.type + ': ' + escapedErr + '</div>';
          }
          detailPanels += '</div>';
        }

        // Event count
        detailPanels += '<div style="font-size:11px;color:#9ca3af;margin-top:8px;">Total trace events: ' + (td.eventCount || 0) + '</div>';
      }

      // Trace file path
      if (tm.tracePath) {
        detailPanels += '<div style="font-size:11px;color:#9ca3af;margin-top:4px;">Trace: <code style="font-size:10px;">' + tm.tracePath + '</code></div>';
      }

      detailPanels += '</div></div>'; // close test-case-body, test-case-panel
    }
    detailPanels += '</div></div>'; // close detail-body, detail-panel
  }

  // --- Best/Worst highlights ---
  let highlightsHtml = '';
  if (comparison.bestPerformer) {
    highlightsHtml += '<div style="display:flex;gap:20px;margin:20px 0;">';
    highlightsHtml += '<div style="flex:1;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">';
    highlightsHtml += '<div style="font-size:12px;color:#16a34a;font-weight:600;text-transform:uppercase;">Best Performer</div>';
    highlightsHtml += '<div style="font-size:20px;font-weight:bold;color:#15803d;">' + comparison.bestPerformer + '</div>';
    const best = rankings[0];
    if (best) highlightsHtml += '<div style="font-size:13px;color:#4ade80;">Composite: ' + best.compositeScore + '</div>';
    highlightsHtml += '</div>';
    if (comparison.worstPerformer && rankings.length > 1) {
      const worst = rankings[rankings.length - 1];
      highlightsHtml += '<div style="flex:1;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">';
      highlightsHtml += '<div style="font-size:12px;color:#dc2626;font-weight:600;text-transform:uppercase;">Needs Improvement</div>';
      highlightsHtml += '<div style="font-size:20px;font-weight:bold;color:#b91c1c;">' + comparison.worstPerformer + '</div>';
      highlightsHtml += '<div style="font-size:13px;color:#f87171;">Composite: ' + worst.compositeScore + '</div>';
      highlightsHtml += '</div>';
    }
    highlightsHtml += '</div>';
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Skills Evaluation - Consolidated Report</title>
<style>
*{box-sizing:border-box;}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:40px;background:#f0f2f5;color:#1f2937;}
.container{max-width:1400px;margin:0 auto;background:white;padding:40px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,.08);}
h1{color:#111827;margin:0 0 8px;font-size:28px;}
h2{color:#374151;margin-top:48px;padding-bottom:12px;border-bottom:2px solid #e5e7eb;font-size:20px;}
h3{color:#4b5563;margin:16px 0 8px;font-size:16px;}
h4{color:#4b5563;margin:16px 0 8px;font-size:14px;}
.subtitle{color:#6b7280;font-size:14px;margin-bottom:24px;}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin:24px 0;}
.card{color:white;padding:20px;border-radius:12px;text-align:center;}
.card h3{margin:0 0 8px;font-size:12px;opacity:.9;color:white;text-transform:uppercase;letter-spacing:.5px;}
.card p{margin:0;font-size:28px;font-weight:700;}
.card.blue{background:linear-gradient(135deg,#3b82f6,#2563eb);}
.card.green{background:linear-gradient(135deg,#22c55e,#16a34a);}
.card.red{background:linear-gradient(135deg,#ef4444,#dc2626);}
.card.purple{background:linear-gradient(135deg,#8b5cf6,#7c3aed);}
table{width:100%;border-collapse:collapse;margin-top:16px;}
th{background:#f9fafb;padding:12px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.3px;cursor:pointer;user-select:none;}
th:hover{background:#f3f4f6;}
td{padding:12px;border-bottom:1px solid #f3f4f6;vertical-align:middle;font-size:14px;}
tr:hover{background:#fafbfc;}
.inner-table{margin-top:8px;}
.inner-table th{font-size:11px;padding:8px;text-transform:none;}
.inner-table td{padding:8px;font-size:12px;}
.detail-panel{border:1px solid #e5e7eb;border-radius:10px;margin-bottom:12px;overflow:hidden;}
.detail-header{display:flex;align-items:center;padding:16px 20px;background:#fafbfc;cursor:pointer;user-select:none;}
.detail-header:hover{background:#f3f4f6;}
.detail-body{display:none;padding:20px;border-top:1px solid #e5e7eb;}
.detail-panel.open .detail-body{display:block;}
.detail-panel.open .chevron{transform:rotate(180deg);}
.chevron{transition:transform .2s;font-size:12px;color:#9ca3af;margin-left:8px;}
.ranking-section{margin:24px 0;}
.composite-formula{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-size:13px;color:#64748b;margin:12px 0;}
.test-case-panel{border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;overflow:hidden;}
.test-case-header{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#fafbfc;cursor:pointer;user-select:none;font-size:13px;}
.test-case-header:hover{background:#f3f4f6;}
.test-case-body{display:none;padding:16px;border-top:1px solid #e5e7eb;background:#fff;}
.test-case-panel.open .test-case-body{display:block;}
.test-case-panel.open .chevron{transform:rotate(180deg);}
.trace-section{margin-bottom:12px;padding-left:12px;border-left:3px solid #e5e7eb;}
.trace-section-title{font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px;}
.trace-prompt{background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:10px;font-size:13px;color:#0c4a6e;white-space:pre-wrap;word-break:break-word;}
.trace-message{background:#f9fafb;border-radius:4px;padding:8px;font-size:12px;color:#374151;margin-bottom:4px;white-space:pre-wrap;word-break:break-word;}
.trace-error{background:#fef2f2;border-radius:4px;padding:6px 8px;font-size:12px;color:#b91c1c;margin-bottom:4px;}
.tool-timeline{display:flex;flex-direction:column;gap:4px;}
.tool-call-item{display:flex;align-items:flex-start;gap:8px;padding:4px 0;}
.tool-name{background:#eef2ff;color:#4338ca;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap;flex-shrink:0;}
.tool-input{font-size:11px;color:#6b7280;word-break:break-all;background:#f9fafb;padding:2px 6px;border-radius:3px;}
</style>
</head>
<body>
<div class="container">

<h1>Agent Skills Evaluation Report</h1>
<p class="subtitle">Run: ${results.run_id} | Generated: ${results.created_at} | Backend: ${results.meta?.backend || 'N/A'} | Platform: ${results.meta?.platform || 'all'}</p>

<div class="summary">
${cardsHtml}
</div>

${highlightsHtml}

<h2>Skill Comparison</h2>
<div class="composite-formula">Composite Score = 40% Static Score + 40% Dynamic Pass Rate + 20% Efficiency Score</div>
<table id="comparison-table">
<tr>
<th onclick="sortTable(0)" style="width:60px;">Rank</th>
<th onclick="sortTable(1)">Skill</th>
<th onclick="sortTable(2)" style="text-align:center;width:100px;">Static</th>
<th onclick="sortTable(3)" style="text-align:center;width:110px;">Dynamic</th>
<th onclick="sortTable(4)" style="text-align:center;width:100px;">Efficiency</th>
<th onclick="sortTable(5)" style="text-align:center;width:90px;">Tokens</th>
<th onclick="sortTable(6)" style="text-align:center;width:90px;">Thrashing</th>
<th onclick="sortTable(7)" style="text-align:center;width:100px;">Composite</th>
</tr>
${comparisonRows}
</table>

<h2>Rankings</h2>
<div class="ranking-section">
${rankingBars}
</div>

<h2>Per-Skill Details</h2>
<p style="font-size:13px;color:#6b7280;">Click on a skill to expand its detailed evaluation.</p>
${detailPanels}

</div>

<script>
// Sortable table
let sortDir = {};
function sortTable(col) {
  const table = document.getElementById('comparison-table');
  const rows = Array.from(table.rows).slice(1);
  const dir = sortDir[col] = !(sortDir[col] || false);
  rows.sort((a, b) => {
    let av = a.cells[col].textContent.replace(/[^0-9.-]/g, '');
    let bv = b.cells[col].textContent.replace(/[^0-9.-]/g, '');
    av = parseFloat(av) || 0;
    bv = parseFloat(bv) || 0;
    return dir ? av - bv : bv - av;
  });
  rows.forEach(r => table.appendChild(r));
}
// Expand first panel by default
const firstPanel = document.querySelector('.detail-panel');
if (firstPanel) firstPanel.classList.add('open');
</script>
</body>
</html>`;

  return html;
}

function generateConsolidatedMarkdownReport(results) {
  const summary = results.summary || {};
  const comparison = results.comparison || {};
  const staticEval = results.static_eval || {};
  const dynamicEval = results.dynamic_eval || {};
  const rankings = comparison.rankings || [];

  let md = '# Agent Skills Evaluation - Consolidated Report\n\n';
  md += '**Run ID:** ' + results.run_id + '\n';
  md += '**Created:** ' + results.created_at + '\n';
  md += '**Backend:** ' + (results.meta?.backend || 'N/A') + '\n\n';

  md += '## Executive Summary\n\n';
  md += '| Metric | Value |\n|--------|-------|\n';
  md += '| Skills Evaluated | ' + (summary.total_skills_evaluated || 0) + ' |\n';
  md += '| Static Score | ' + (summary.static_score != null ? summary.static_score + '%' : 'N/A') + ' |\n';
  md += '| Dynamic Pass Rate | ' + (summary.dynamic_pass_rate != null ? summary.dynamic_pass_rate + '%' : 'N/A') + ' |\n';
  md += '| Composite Score | ' + (summary.average_composite_score != null ? summary.average_composite_score + '%' : 'N/A') + ' |\n';
  md += '| Dynamic Tests | ' + (summary.total_dynamic_tests || 0) + ' |\n';
  md += '| Avg Efficiency | ' + (comparison.averageEfficiency != null ? comparison.averageEfficiency + '%' : 'N/A') + ' |\n';
  md += '| Thrashing | ' + (comparison.totalThrashingIncidents || 0) + ' |\n';
  md += '| Total Tokens | ' + (comparison.totalTokensUsed || 0) + ' |\n\n';

  if (comparison.bestPerformer) {
    md += '**Best Performer:** ' + comparison.bestPerformer + '\n';
  }
  if (comparison.worstPerformer && rankings.length > 1) {
    md += '**Needs Improvement:** ' + comparison.worstPerformer + '\n';
  }
  md += '\n';

  md += '## Skill Comparison\n\n';
  md += '*Composite = 40% Static + 40% Dynamic + 20% Efficiency*\n\n';
  md += '| Rank | Skill | Static | Dynamic | Efficiency | Tokens | Thrashing | Composite |\n';
  md += '|------|-------|--------|---------|------------|--------|-----------|-----------|\n';
  for (const r of rankings) {
    md += '| #' + r.rank + ' | ' + r.skillName + ' | ';
    md += (r.staticScore != null ? r.staticScore + '%' : 'N/A') + ' | ';
    md += r.dynamicPassRate + '% (' + r.passedCount + '/' + r.testCount + ') | ';
    md += (r.efficiencyAvg != null ? r.efficiencyAvg + '%' : 'N/A') + ' | ';
    md += (r.totalTokens || 0) + ' | ';
    md += (r.thrashingCount > 0 ? 'Yes (' + r.thrashingCount + ')' : 'No') + ' | ';
    md += r.compositeScore + ' |\n';
  }
  md += '\n';

  // Per-skill dynamic detail
  if (dynamicEval.skills?.length) {
    md += '## Per-Skill Details\n\n';
    for (const skill of dynamicEval.skills) {
      const pr = skill.summary?.total
        ? Math.round((skill.summary.passed / skill.summary.total) * 100) : 0;
      md += '### ' + skill.skillName + ' (' + pr + '% pass rate)\n\n';
      md += '| Test | Status | Commands | Errors | Efficiency | Tokens | Thrashing |\n';
      md += '|------|--------|----------|--------|------------|--------|-----------|\n';
      for (const tm of (skill.traceMetrics || [])) {
        md += '| ' + tm.testId + ' | ' + (tm.passed ? 'Pass' : 'Fail') + ' | ';
        md += tm.commandCount + ' | ' + tm.errorCount + ' | ';
        md += (tm.efficiencyScore != null ? tm.efficiencyScore + '%' : 'N/A') + ' | ';
        md += (tm.tokenUsage?.total || 0) + ' | ';
        md += (tm.thrashing?.isThrashing ? 'Yes' : 'No') + ' |\n';
      }
      md += '\n';
    }
  }

  return md;
}

module.exports = { generateReport };
