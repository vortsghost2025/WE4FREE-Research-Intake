import * as fs from 'fs';
import * as path from 'path';
import { ScoredArtifact } from '../types';

/**
 * Generate a plain-text briefing summarizing top findings.
 */
export function generateBriefing(scored: ScoredArtifact[], briefingDir: string): string {
  if (!fs.existsSync(briefingDir)) {
    fs.mkdirSync(briefingDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `briefing-${timestamp}.txt`;
  const filepath = path.join(briefingDir, filename);

  const topFindings = scored
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 20);

  const lines: string[] = [
    '=== WE4FREE Research Intake Briefing ===',
    `Generated: ${new Date().toISOString()}`,
    `Total findings: ${scored.length}`,
    `Top findings shown: ${topFindings.length}`,
    '',
    '--- Top Findings ---',
    '',
  ];

  topFindings.forEach((s, i) => {
    lines.push(`[${i + 1}] ${s.artifact.title}`);
    lines.push(`    Source: ${s.artifact.source} | Lane: ${s.laneTarget} | Relevance: ${(s.relevanceScore * 100).toFixed(0)}%`);
    lines.push(`    URL: ${s.artifact.url}`);
    lines.push(`    Risk: ${s.riskScore > 0.6 ? 'high' : s.riskScore > 0.3 ? 'medium' : 'low'} | Action: ${s.recommendedAction}`);
    lines.push(`    ${s.artifact.abstract.slice(0, 150)}...`);
    lines.push('');
  });

  fs.writeFileSync(filepath, lines.join('\n'));

  console.log('');
  console.log('=== BRIEFING REPORT ===');
  console.log(`Total findings: ${scored.length}`);
  console.log(`Top findings shown: ${topFindings.length}`);
  console.log(`Briefing saved to: ${filepath}`);
  if (topFindings.length > 0) {
    console.log('');
    topFindings.forEach((s, i) => {
      console.log(`Finding ${i + 1}:`);
      console.log(`  Title: ${s.artifact.title}`);
      console.log(`  Source: ${s.artifact.source}`);
      console.log(`  Target Lane: ${s.laneTarget}`);
      console.log(`  Relevance: ${(s.relevanceScore * 100).toFixed(0)}%`);
      console.log(`  Risk: ${s.riskScore > 0.6 ? 'HIGH' : s.riskScore > 0.3 ? 'MEDIUM' : 'LOW'}`);
      console.log(`  Action: ${s.recommendedAction}`);
      console.log(`  URL: ${s.artifact.url}`);
      console.log('');
    });
  } else {
    console.log('No findings above threshold.');
  }
  console.log('=== END BRIEFING REPORT ===');
  console.log('');
  return filepath;
}
