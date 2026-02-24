import type { CoMFields } from '@/lib/salesforce/client';
import type { FieldGap, MantraAssessment } from '@/types/database';

/**
 * Stage-aware CoM coaching framework.
 *
 * Maps Salesforce StageName values to four coaching stages (Qualify, Discover,
 * Scope, Validate) and evaluates CoM field maturity against stage expectations.
 */

// ── Coaching stage ──────────────────────────────────────────────────────────

export type CoachingStage = 'Qualify' | 'Discover' | 'Scope' | 'Validate' | 'Unknown';

/**
 * Map a raw Salesforce StageName to one of the four coaching stages.
 * Case-insensitive substring matching to handle "01 - Qualify", "Discovery", etc.
 */
export function toCoachingStage(sfStageName: string | null): CoachingStage {
  if (!sfStageName) return 'Unknown';
  const s = sfStageName.toLowerCase();
  if (s.includes('qualify') || s.includes('qualification')) return 'Qualify';
  if (s.includes('discover') || s.includes('discovery')) return 'Discover';
  if (s.includes('scope') || s.includes('scoping') || s.includes('value prop')) return 'Scope';
  if (
    s.includes('validate') ||
    s.includes('validation') ||
    s.includes('proposal') ||
    s.includes('negotiat') ||
    s.includes('decision')
  ) return 'Validate';
  return 'Unknown';
}

// ── Stage expectations ───────────────────────────────────────────────────────

type FieldExpectation = 'not_yet' | 'surface' | 'emerging' | 'confirmed' | 'complete';

interface StageExpectations {
  objective: string;
  fields: Record<keyof Omit<CoMFields, 'stageName'>, {
    expectation: FieldExpectation;
    description: string;
    severity: 'critical' | 'moderate' | 'low'; // severity if missing when expected
  }>;
  mantraExpectation: FieldExpectation;
  coachingFocus: string;
}

const STAGE_EXPECTATIONS: Record<CoachingStage, StageExpectations> = {
  Qualify: {
    objective: 'Confirm there\'s a real problem worth solving and a person who cares.',
    fields: {
      identifiedPain:    { expectation: 'surface',   description: 'Buyer has acknowledged a problem exists (surface-level).', severity: 'critical' },
      valueDrivers:      { expectation: 'surface',   description: 'Working hypothesis on value driver (Risk, Scale, or Global).', severity: 'moderate' },
      desiredFutureState:{ expectation: 'not_yet',   description: 'Too early — focus is on understanding current pain.', severity: 'low' },
      metrics:           { expectation: 'not_yet',   description: 'NRIs implied but not quantified yet.', severity: 'low' },
      decisionCriteria:  { expectation: 'not_yet',   description: 'Not yet expected.', severity: 'low' },
      differentiators:   { expectation: 'not_yet',   description: 'Not yet expected.', severity: 'low' },
      mantra:            { expectation: 'not_yet',   description: 'Not yet expected.', severity: 'low' },
    },
    mantraExpectation: 'not_yet',
    coachingFocus: 'Did the rep confirm real pain? Identify buyer scenario (Greenfield vs R&R)? Is there enough signal to justify moving to Discover?',
  },

  Discover: {
    objective: 'Deep understanding of pain, quantification, and desired outcomes in the buyer\'s language.',
    fields: {
      identifiedPain:    { expectation: 'complete',  description: 'Before Scenarios in buyer\'s own words — specific situations, not generic problems.', severity: 'critical' },
      valueDrivers:      { expectation: 'confirmed', description: 'Validated through discovery questions, not assumed.', severity: 'critical' },
      desiredFutureState:{ expectation: 'emerging',  description: 'Buyer has articulated what "better" looks like — PBOs forming in buyer language.', severity: 'moderate' },
      metrics:           { expectation: 'emerging',  description: 'At least one quantified NRI (dollar amounts, time costs, or risk exposure).', severity: 'critical' },
      decisionCriteria:  { expectation: 'not_yet',   description: 'Awareness level only — not yet expected to be shaped.', severity: 'low' },
      differentiators:   { expectation: 'not_yet',   description: 'Not yet expected.', severity: 'low' },
      mantra:            { expectation: 'emerging',  description: 'Rep could draft a version capturing core problem → value (may still use seller language).', severity: 'moderate' },
    },
    mantraExpectation: 'emerging',
    coachingFocus: 'Are NRIs quantified or just implied? Has the buyer articulated PBOs in their own words? Are Before Scenarios specific enough to build a business case?',
  },

  Scope: {
    objective: 'Connect Anrok\'s differentiators to the buyer\'s specific pain. Shape decision criteria.',
    fields: {
      identifiedPain:    { expectation: 'complete',  description: 'Pain well-documented and buyer-confirmed. No new discovery needed.', severity: 'critical' },
      valueDrivers:      { expectation: 'complete',  description: 'Clear, validated, driving the deal narrative.', severity: 'critical' },
      desiredFutureState:{ expectation: 'complete',  description: 'PBOs concrete, measurable, in buyer\'s language. Buyer has said these out loud.', severity: 'critical' },
      metrics:           { expectation: 'complete',  description: 'Multiple quantified NRIs and projected PBOs — specific ROI or value calculations.', severity: 'critical' },
      decisionCriteria:  { expectation: 'confirmed', description: 'Evaluation criteria explicitly favor Anrok\'s strengths. Required Capabilities established.', severity: 'critical' },
      differentiators:   { expectation: 'confirmed', description: 'Rep has positioned 2+ differentiators via trap-setting questions.', severity: 'critical' },
      mantra:            { expectation: 'confirmed', description: 'Specific to this buyer\'s situation, in buyer\'s language. A manager could repeat it.', severity: 'critical' },
    },
    mantraExpectation: 'confirmed',
    coachingFocus: 'Has the rep positioned differentiators or just demoed features? Are decision criteria shaped? Can the champion articulate why Anrok?',
  },

  Validate: {
    objective: 'Every stakeholder understands the value. The business case is undeniable. No gaps.',
    fields: {
      identifiedPain:    { expectation: 'complete',  description: 'Fully documented, referenced in all stakeholder conversations.', severity: 'critical' },
      valueDrivers:      { expectation: 'complete',  description: 'Consistently reinforced across all buyer interactions.', severity: 'critical' },
      desiredFutureState:{ expectation: 'complete',  description: 'Buyer has confirmed PBOs — numbers are agreed upon, not projected.', severity: 'critical' },
      metrics:           { expectation: 'complete',  description: 'Buyer-confirmed numbers — not rep estimates. The buyer owns these metrics.', severity: 'critical' },
      decisionCriteria:  { expectation: 'complete',  description: 'Locked and aligned to Anrok\'s differentiators. Buyer is evaluating on our terms.', severity: 'critical' },
      differentiators:   { expectation: 'complete',  description: 'Validated with proof points, references, or demos. Buyer believes them.', severity: 'critical' },
      mantra:            { expectation: 'complete',  description: 'Could be delivered to CEO/CFO in one sentence. Champion can deliver it without coaching.', severity: 'critical' },
    },
    mantraExpectation: 'complete',
    coachingFocus: 'Are there any field gaps that could derail this deal? Is the mantra strong enough for the economic buyer? Have all differentiators been proven, not just claimed?',
  },

  Unknown: {
    objective: 'Deal stage could not be mapped to a CoM coaching stage.',
    fields: {
      identifiedPain:    { expectation: 'not_yet', description: '', severity: 'low' },
      valueDrivers:      { expectation: 'not_yet', description: '', severity: 'low' },
      desiredFutureState:{ expectation: 'not_yet', description: '', severity: 'low' },
      metrics:           { expectation: 'not_yet', description: '', severity: 'low' },
      decisionCriteria:  { expectation: 'not_yet', description: '', severity: 'low' },
      differentiators:   { expectation: 'not_yet', description: '', severity: 'low' },
      mantra:            { expectation: 'not_yet', description: '', severity: 'low' },
    },
    mantraExpectation: 'not_yet',
    coachingFocus: 'Stage unknown — coaching will be based on transcript content only.',
  },
};

// ── Field gap detection ──────────────────────────────────────────────────────

const FIELD_LABELS: Record<keyof Omit<CoMFields, 'stageName'>, string> = {
  identifiedPain:     'Identified Pain (Pain__c)',
  valueDrivers:       'Value Drivers (Value_Drivers__c)',
  desiredFutureState: 'Desired Future State (Desired_Future_State_After_PBOs__c)',
  metrics:            'Metrics / NRIs (Measure_Results_Metrics__c)',
  decisionCriteria:   'Decision Criteria (Decision_Criteria__c)',
  differentiators:    'Differentiators (Differentiators__c)',
  mantra:             'Mantra (Mantra__c)',
};

/**
 * Compare CoM field values against stage expectations and return gap objects.
 * A "gap" is any field that is expected at this stage but empty/null.
 */
export function detectFieldGaps(comFields: CoMFields, sfStageName: string | null): FieldGap[] {
  const stage = toCoachingStage(sfStageName);
  const expectations = STAGE_EXPECTATIONS[stage];
  const gaps: FieldGap[] = [];

  const fieldKeys = Object.keys(FIELD_LABELS) as Array<keyof Omit<CoMFields, 'stageName'>>;

  for (const key of fieldKeys) {
    const expectation = expectations.fields[key].expectation;
    if (expectation === 'not_yet') continue; // Not expected at this stage — not a gap

    const value = comFields[key];
    const isEmpty = !value || value.trim() === '';

    if (isEmpty) {
      gaps.push({
        field: FIELD_LABELS[key],
        expectedState: expectations.fields[key].description,
        actualValue: null,
        severity: expectations.fields[key].severity,
      });
    }
  }

  return gaps;
}

// ── Mantra assessment ────────────────────────────────────────────────────────

/**
 * Assess mantra quality relative to stage expectations.
 * Uses length as a heuristic — the prompt will do deeper quality evaluation.
 */
export function assessMantraQuality(mantraValue: string | null, sfStageName: string | null): MantraAssessment {
  const stage = toCoachingStage(sfStageName);
  const expectedQuality = STAGE_EXPECTATIONS[stage].mantraExpectation;

  if (!mantraValue || mantraValue.trim() === '') {
    const isGap = expectedQuality !== 'not_yet';
    return { value: null, qualityForStage: 'not_yet', isGap };
  }

  const len = mantraValue.trim().length;
  let quality: MantraAssessment['qualityForStage'];
  if (len < 50) quality = 'emerging';
  else if (len < 200) quality = 'strong';
  else quality = 'executive_resonant';

  // Gap if quality is below what's expected
  const qualityRank = { not_yet: 0, emerging: 1, strong: 2, confirmed: 3, executive_resonant: 4, complete: 4 };
  const isGap = qualityRank[quality] < qualityRank[expectedQuality as keyof typeof qualityRank];

  return { value: mantraValue, qualityForStage: quality, isGap };
}

// ── Context formatter ────────────────────────────────────────────────────────

/**
 * Build the markdown block that gets injected as {{STAGE_CONTEXT}} into the coaching prompt.
 */
export function formatStageContext(
  sfStageName: string | null,
  gaps: FieldGap[],
  mantraAssessment: MantraAssessment
): string {
  const stage = toCoachingStage(sfStageName);
  const expectations = STAGE_EXPECTATIONS[stage];

  const lines: string[] = [
    `**Current SF Stage:** ${sfStageName || 'Unknown'} → Coaching stage: **${stage}**`,
    `**Stage Objective:** ${expectations.objective}`,
    '',
    '**CoM Field Status:**',
  ];

  for (const gap of gaps.filter(g => g.severity === 'critical')) {
    lines.push(`- 🚨 **[CRITICAL GAP]** ${gap.field}: Expected — ${gap.expectedState}`);
  }
  for (const gap of gaps.filter(g => g.severity === 'moderate')) {
    lines.push(`- ⚠️ **[MODERATE GAP]** ${gap.field}: Expected — ${gap.expectedState}`);
  }
  for (const gap of gaps.filter(g => g.severity === 'low')) {
    lines.push(`- ℹ️ **[LOW PRIORITY GAP]** ${gap.field}: Expected — ${gap.expectedState}`);
  }

  if (gaps.length === 0) {
    lines.push('- ✅ All expected CoM fields are populated for this stage.');
  }

  // Mantra section
  lines.push('');
  if (mantraAssessment.isGap) {
    const stageExpectation = STAGE_EXPECTATIONS[stage].fields.mantra.description;
    lines.push(`**Mantra:** ⚠️ Gap detected — expected at ${stage} stage. ${stageExpectation}`);
    if (mantraAssessment.value) {
      lines.push(`Current value: "${mantraAssessment.value}"`);
    }
  } else if (mantraAssessment.value) {
    lines.push(`**Mantra (current):** "${mantraAssessment.value}" — quality assessed as: ${mantraAssessment.qualityForStage}`);
  } else {
    lines.push(`**Mantra:** Not yet expected at ${stage} stage.`);
  }

  lines.push('');
  lines.push(`**Coaching Focus for ${stage}:** ${expectations.coachingFocus}`);

  return lines.join('\n');
}
