const SENSITIVE_REFERENCE_TERMS =
  /\b(?:crucif\w*|condenad\w*|herid\w*|lesion\w*|sangr\w*|clav\w*|espin\w*|tortur\w*|ejecut\w*|muert\w*|morir\w*|matar\w*|golpead\w*|gore|violenc\w*|weapon\w*|blood\w*|injur\w*|wound\w*|nail\w*|thorn\w*|death\w*|kill\w*|execution\w*)\b/i;

const SAFE_HEADER = [
  'Create a respectful historical cinematic still suitable for a general audience.',
  'Keep the visible moment calm, restrained and observational.',
  'Prioritize facial expression, posture, period clothing, architecture, natural light, depth and atmosphere.'
].join(' ');

const SAFE_FOOTER = [
  'Preserve character identity from any supplied reference images.',
  'Use natural anatomy and physically plausible posture.',
  'No text, subtitles, captions, logos or watermarks.'
].join(' ');

export function hasSensitiveReferenceTerms(value: string) {
  return SENSITIVE_REFERENCE_TERMS.test(value);
}

export function buildProviderSafeImagePrompt(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return SAFE_HEADER + ' ' + SAFE_FOOTER;
  }

  const sentences = compact
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !SENSITIVE_REFERENCE_TERMS.test(sentence))
    .filter((sentence) => !/^Negative constraints\s*:/i.test(sentence))
    .filter((sentence) => !/^NEGATIVO\s*:/i.test(sentence));

  const body = sentences
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4200);

  return [SAFE_HEADER, body, SAFE_FOOTER]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
