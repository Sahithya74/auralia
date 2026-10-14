// First-pass safety screen, run on every user message BEFORE the model is called.
// Pure and synchronous: no network, no database, independently unit-tested.
//
// It is deliberately conservative about everyday language ("this traffic is killing
// me", "I'm dead tired") and is a heuristic, not a classifier: the companion prompt
// also carries safety instructions as a backstop for anything this misses.
// Non-English phrase lists need review by native speakers before production use.

export type SafetyCategory = 'self_harm' | 'abuse' | 'harm_to_others' | 'medical';
export type SafetyLevel = 'none' | 'concern' | 'urgent';

export interface SafetyAssessment {
  level: SafetyLevel;
  categories: SafetyCategory[];
}

interface Rule {
  category: SafetyCategory;
  level: Exclude<SafetyLevel, 'none'>;
  pattern: RegExp;
}

const r = (category: SafetyCategory, level: Rule['level'], ...patterns: RegExp[]): Rule[] =>
  patterns.map((pattern) => ({ category, level, pattern }));

const RULES: Rule[] = [
  // ---------- English ----------
  ...r(
    'self_harm',
    'urgent',
    /\b(going to|gonna|about to|will|plan(ning)? to|decided to|ready to)\s+(kill myself|end my (own )?life|end it all|take my (own )?life)\b/,
    /\b(tonight|today|right now)\b[^.!?]{0,60}\b(kill myself|end my life|end it all)\b/,
    /\b(kill myself|end my life|end it all)\b[^.!?]{0,40}\b(tonight|today|right now)\b/,
    /\b(took|swallowed|have taken|i'?ve taken)\s+(a lot of |all (of )?(my|the) |too many )?(pills|tablets|sleeping pills|poison)\b/,
    /\bsuicide note\b/,
  ),
  ...r(
    'self_harm',
    'concern',
    /\b(kill|killing|end|ending|take|taking)\s+(myself|my (own )?life)\b/,
    /\bend(ing)? it all\b/,
    /\bsuicid(e|al)\b/,
    /\b(want|wanted|wanting|wish|wishing)\s+(to )?(die|be dead|not be alive|never wake up)\b/,
    /\b(don'?t|do not|no longer)\s+want to\s+(live|be alive|wake up|exist)\b/,
    /\bno (reason|point) (to|in) (live|living|go on|going on)\b/,
    /\b(better off|happier) without me\b/,
    /\b(hurt|harm|cut|hurting|harming|cutting)\s+myself\b/,
    /\bself[-\s]?harm/,
    /\b(can'?t|cannot) go on living\b/,
  ),
  ...r(
    'abuse',
    'urgent',
    /\bthreaten(s|ed|ing)? to (kill|murder|burn|hurt)\b/,
    /\btried to (kill|strangle|choke|burn|poison) me\b/,
    /\b(i'?m|i am) (not safe|in danger)\b/,
  ),
  ...r(
    'abuse',
    'concern',
    /\b(he|husband|in-?laws?|mother-in-law|father-in-law|partner|they)\s+(\w+\s+){0,3}(hits?|hitting|beats?|beating|slaps?|slapped|slapping|kicks?|kicked|kicking|chokes?|choked|choking|pushed|burn(s|ed|t)?)\s+me\b/,
    /\bdomestic (violence|abuse)\b/,
    /\b(abusive|abuses|abused|abusing)\b.{0,30}\b(husband|marriage|in-?laws?|partner)\b/,
    /\b(husband|in-?laws?|partner)\b.{0,30}\b(abusive|abuses|abused|abusing)\b/,
    /\bdowry\b.{0,40}\b(harass|torture|threat|beat|pressur)/,
    /\b(not|don'?t feel) safe (at home|in (my|this) (house|home)|with (him|my husband|them))\b/,
    /\b(forced|forces|forcing) (me )?(to have sex|into sex)\b/,
    /\b(raped?|rapes|sexual(ly)? (abuse|abused|assault|assaulted))\b/,
    /\b(locked me (in|up|out)|won'?t let me (leave|go out))\b/,
  ),
  ...r(
    'harm_to_others',
    'concern',
    /\b(want to|wanted to|feel like|might|going to|scared i'?ll|afraid i'?ll|afraid i might)\s+(hurt|harm|hit|kill|strangle)\s+(my )?(baby|child|children|kids?|son|daughter)\b/,
  ),
  ...r('medical', 'urgent', /\b(overdos(e|ed)|unconscious|not breathing)\b/),
  ...r('medical', 'concern', /\b(can'?t|cannot) breathe\b/, /\bchest pain\b/),

  // ---------- Tamil (script + common romanisation) ----------
  ...r(
    'self_harm',
    'concern',
    /தற்கொலை/,
    /சாக(ணும்|வேண்டும்|போறேன்|ப்போறேன்|லாம்னு|த்\s?தோணுது)/,
    /செத்து(ப்)?\s?(போகணும்|போயிடணும்|போயிடலாம்|போகலாம்)/,
    /உயிர(ை|ு)?\s?(மாய்த்து|விட்டுட|விடணும்)/,
    /வாழ\s?(விருப்பம்\s?இல்லை|பிடிக்கல|பிடிக்கவில்லை|வேண்டாம்)/,
    /\b(thar|that|tha)kolai\b/,
    /\bsaa?ga\s?(num|venum|poren|thonudhu|thonuthu)\b/,
    /\bsethu\s?(poganum|poidanum|poidalam)\b/,
  ),
  ...r(
    'abuse',
    'concern',
    /(அடிக்கிறார்|அடிக்கிறான்|அடிச்சார்|அடிச்சான்|அடிக்கிறாரு)/,
    /கணவர்.{0,20}(அடி|உதை)/,
    /\b(adikkiraar|adikkiran|adikiraru|adichaan|adichaar|adikkuraru)\b/,
  ),
  ...r('abuse', 'urgent', /(கொன்னுடுவேன்|கொன்னுருவேன்|கொலை\s?பண்ணுவேன்)/, /கொல்ல\s?(பார்த்தா|பாத்தா|முயற்சி)/, /\bkonnuduven\b/),

  // ---------- Hindi ----------
  ...r(
    'self_harm',
    'concern',
    /आत्महत्या/,
    /ख़ुदकुशी|खुदकुशी/,
    /मर\s?(जाना|जाऊं|जाऊँ)\s?(चाहती|चाहता)/,
    /मरना\s?(चाहती|चाहता)/,
    /जीना\s?नहीं\s?(चाहती|चाहता)/,
    /जीने\s?का\s?(मन|दिल)\s?नहीं/,
    /(खुद|ख़ुद)\s?को\s?(खत्म|ख़त्म|नुकसान)/,
    /\b(aatm?hatya|atmahatya|khudkushi|khudkhushi)\b/,
    /\b(marna|mar jaana|mar jana)\s+chaht(i|a)\b/,
    /\bjeena nahi chaht(i|a)\b/,
    /\bjeene ka (mann?|dil) nahi\b/,
  ),
  ...r(
    'abuse',
    'concern',
    /(मुझे|मुझको)\s?(मारता|मारते|पीटता|पीटते|मारा|पीटा)/,
    /मारपीट/,
    /(पति|ससुराल)[^।.!?]{0,30}(मारत|पीटत|मारा|पीटा)/,
    /दहेज[^।.!?]{0,30}(परेशान|तंग|मार|प्रताड़)/,
    /\bmujhe (maarta|marta|peetta|peette|maara|mara|peeta)\b/,
    /\b(maar ?peet|marpeet)\b/,
  ),
  ...r('abuse', 'urgent', /जान\s?से\s?मार/, /मार\s?(डालेगा|डालेंगे|डालूंगा)/, /\bjaan se maar/, /\bmaar daal(ega|enge|unga)\b/),

  // ---------- Malayalam ----------
  ...r(
    'self_harm',
    'concern',
    /ആത്മഹത്യ/,
    /മരിക്കണം/,
    /ചാകണം/,
    /മരിക്കാൻ\s?(തോന്നുന്നു|തോന്നുന്നുണ്ട്)/,
    /ജീവിക്കണ്ട/,
    /ജീവിക്കാൻ\s?(ആഗ്രഹമില്ല|തോന്നുന്നില്ല)/,
    /\b(marikkanam|chaakanam|chakanam|aathmahathya|athmahathya)\b/,
    /\bmarikkan thonnunnu\b/,
  ),
  ...r(
    'abuse',
    'concern',
    /എന്നെ\s?(തല്ലുന്നു|തല്ലി|തല്ലും|അടിക്കുന്നു|അടിച്ചു|ഉപദ്രവിക്കുന്നു)/,
    /\benne (thallunnu|thalli|adikkunnu|adichu)\b/,
  ),
  ...r('abuse', 'urgent', /(കൊല്ലുമെന്ന്|കൊല്ലാൻ\s?നോക്കി)/, /\bkollumennu\b/),

  // ---------- Kannada ----------
  ...r(
    'self_harm',
    'concern',
    /ಆತ್ಮಹತ್ಯೆ/,
    /ಸಾಯ(ಬೇಕು|ಬೇಕೆನಿಸುತ್ತಿದೆ)/,
    /ಬದುಕ(ಲು|ೋಕೆ)\s?(ಇಷ್ಟವಿಲ್ಲ|ಇಷ್ಟ\s?ಇಲ್ಲ|ಮನಸ್ಸಿಲ್ಲ)/,
    /\b(saayabeku|saaybeku|sayabeku|athmahathye|aathmahatye)\b/,
  ),
  ...r('abuse', 'concern', /ನನ್ನನ್ನು?\s?(ಹೊಡೆ|ಬಡಿ)/, /\bnannannu (hodi|hodey|badi)/),
  ...r('abuse', 'urgent', /(ಕೊಲ್ಲುತ್ತೇನೆ\s?ಅಂತ|ಕೊಲ್ತೀನಿ\s?ಅಂತ|ಕೊಲ್ಲಲು\s?ಪ್ರಯತ್ನ)/),

  // ---------- Telugu ----------
  ...r(
    'self_harm',
    'concern',
    /ఆత్మహత్య/,
    /చనిపోవాల/,
    /చావాల(ని|నిపిస్తోంది|ి)/,
    /(బ్రతకాలని|బతకాలని)\s?లేదు/,
    /\b(chanipovali|chanipovalani|chaavali|chavalani)\b/,
  ),
  ...r('abuse', 'concern', /నన్ను\s?(కొడతా|కొడుతు|కొట్టా|కొట్టాడు|కొడుతున్నా)/, /\bnannu (kodatha|koduthu|kottadu|kodutunna)/),
  ...r('abuse', 'urgent', /(చంపేస్తా(ను)?\s?అని|చంపడానికి\s?ప్రయత్నించ)/),
];

const CATEGORY_ORDER: SafetyCategory[] = ['self_harm', 'abuse', 'harm_to_others', 'medical'];

export function normalizeForScreening(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

export function assessSafety(text: string): SafetyAssessment {
  const normalized = normalizeForScreening(text);
  let level: SafetyLevel = 'none';
  const categories = new Set<SafetyCategory>();
  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) {
      categories.add(rule.category);
      if (rule.level === 'urgent') level = 'urgent';
      else if (level === 'none') level = 'concern';
    }
  }
  return { level, categories: CATEGORY_ORDER.filter((c) => categories.has(c)) };
}
