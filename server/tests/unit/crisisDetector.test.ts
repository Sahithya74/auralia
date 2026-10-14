import { describe, expect, it } from 'vitest';
import { assessSafety } from '../../src/ai/safety/crisisDetector.js';
import { resourcesFor } from '../../src/ai/safety/resources.js';

describe('assessSafety - ordinary feelings are not crises', () => {
  const everyday = [
    'Everyone at home expects me to do everything. Nobody even asks if I am tired.',
    "I'm dead tired after cooking for twelve people.",
    'This traffic is killing me.',
    'My mother-in-law will kill me if the sambar is late, haha.',
    'I am so angry with my husband, he never listens.',
    'I feel lonely since my son left for college.',
    'I could die of embarrassment, the whole family saw.',
    'I cried in the bathroom today. I just feel invisible.',
    'The news hit me hard.',
    'My daughter hit me with a pillow while we were playing.',
    'நான் ரொம்ப களைப்பா இருக்கேன்', // I'm very tired (Tamil)
    'मैं बहुत थक गई हूँ', // I'm very tired (Hindi)
    'എനിക്ക് വല്ലാത്ത ഒറ്റപ്പെടൽ തോന്നുന്നു', // I feel very lonely (Malayalam)
    'ನನಗೆ ತುಂಬಾ ಸುಸ್ತಾಗಿದೆ', // I'm very tired (Kannada)
    'నాకు చాలా ఒంటరిగా అనిపిస్తోంది', // I feel very lonely (Telugu)
  ];
  it.each(everyday)('"%s" -> none', (text) => {
    expect(assessSafety(text)).toEqual({ level: 'none', categories: [] });
  });
});

describe('assessSafety - self-harm', () => {
  it.each([
    'Sometimes I want to die.',
    "I don't want to live anymore",
    'I keep thinking about suicide',
    'Everyone would be better off without me',
    'I have been hurting myself',
    'I just want to end it all',
  ])('"%s" -> concern', (text) => {
    expect(assessSafety(text)).toMatchObject({ level: 'concern', categories: ['self_harm'] });
  });

  it.each([
    "I'm going to kill myself tonight",
    'I have taken all the sleeping pills',
    'I am going to end my life',
    'I wrote a suicide note',
  ])('"%s" -> urgent', (text) => {
    expect(assessSafety(text)).toMatchObject({ level: 'urgent', categories: ['self_harm'] });
  });

  it.each([
    ['ta', 'எனக்கு சாகணும் போல இருக்கு'],
    ['ta', 'தற்கொலை பண்ணிக்கலாம்னு தோணுது'],
    ['ta (romanised)', 'enakku saaganum pola irukku'],
    ['hi', 'मैं मरना चाहती हूँ'],
    ['hi', 'अब जीना नहीं चाहती'],
    ['hi (romanised)', 'main marna chahti hoon'],
    ['ml', 'എനിക്ക് മരിക്കണം'],
    ['kn', 'ನನಗೆ ಸಾಯಬೇಕು ಅನಿಸುತ್ತಿದೆ'],
    ['te', 'నాకు చనిపోవాలని ఉంది'],
  ])('%s: "%s" -> self_harm', (_lang, text) => {
    const result = assessSafety(text);
    expect(result.level).not.toBe('none');
    expect(result.categories).toContain('self_harm');
  });
});

describe('assessSafety - abuse and danger from others', () => {
  it.each([
    'My husband beats me when he drinks',
    'He hits me sometimes',
    'My in-laws are harassing me for dowry money and threatening me',
    "I don't feel safe at home",
    'This is domestic violence, isn\'t it?',
  ])('"%s" -> abuse concern', (text) => {
    const result = assessSafety(text);
    expect(result.categories).toContain('abuse');
    expect(result.level).not.toBe('none');
  });

  it.each(['He threatened to kill me', 'He tried to strangle me last night', 'I am not safe right now'])(
    '"%s" -> urgent',
    (text) => {
      expect(assessSafety(text)).toMatchObject({ level: 'urgent', categories: ['abuse'] });
    },
  );

  it.each([
    ['ta', 'என் கணவர் என்னை அடிக்கிறார்'],
    ['hi', 'पति मुझे मारता है'],
    ['ml', 'ഭർത്താവ് എന്നെ തല്ലുന്നു'],
    ['kn', 'ಗಂಡ ನನ್ನನ್ನು ಹೊಡೆಯುತ್ತಾನೆ'],
    ['te', 'నా భర్త నన్ను కొడతాడు'],
  ])('%s: "%s" -> abuse', (_lang, text) => {
    expect(assessSafety(text).categories).toContain('abuse');
  });
});

describe('assessSafety - other categories', () => {
  it('flags fear of harming a child as harm_to_others', () => {
    expect(assessSafety("I'm scared I'll hurt my baby").categories).toContain('harm_to_others');
  });
  it('flags an overdose as an urgent medical emergency', () => {
    expect(assessSafety('my mother took an overdose')).toMatchObject({ level: 'urgent', categories: ['medical'] });
  });
  it('reports multiple categories in a stable order', () => {
    expect(assessSafety('My husband beats me and I want to die').categories).toEqual(['self_harm', 'abuse']);
  });
});

describe('resourcesFor', () => {
  it('always includes emergency services and the relevant helpline', () => {
    const ids = resourcesFor('IN', ['abuse']).map((r) => r.id);
    expect(ids).toEqual(['emergency', 'women_helpline']);
    expect(resourcesFor('IN', ['self_harm']).map((r) => r.id)).toEqual(['emergency', 'telemanas']);
  });
  it('returns nothing when nothing was flagged', () => {
    expect(resourcesFor('IN', [])).toEqual([]);
  });
});
