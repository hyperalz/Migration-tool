export function getAISettings() {
  const stored = localStorage.getItem('mapbridge_ai_settings');
  return stored ? JSON.parse(stored) : {
    mode: 'heuristic',
    apiKey: '',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  };
}

export function saveAISettings(settings) {
  localStorage.setItem('mapbridge_ai_settings', JSON.stringify(settings));
}

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function similarity(a, b) {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  
  if (normA === normB) return 1.0;
  
  const longer = normA.length > normB.length ? normA : normB;
  const shorter = normA.length > normB.length ? normB : normA;
  
  if (longer.length === 0) return 0;
  
  if (longer.includes(shorter)) return 0.7 + (shorter.length / longer.length) * 0.3;
  
  const distance = levenshteinDistance(normA, normB);
  return Math.max(0, 1 - distance / longer.length);
}

function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function typeCompatibility(sourceType, targetType) {
  const normS = normalizeText(sourceType);
  const normT = normalizeText(targetType);
  
  const numericTypes = ['int', 'integer', 'numeric', 'decimal', 'float', 'double', 'number'];
  const stringTypes = ['varchar', 'char', 'string', 'text'];
  const dateTypes = ['date', 'datetime', 'timestamp'];
  
  const sIsNum = numericTypes.some(t => normS.includes(t));
  const tIsNum = numericTypes.some(t => normT.includes(t));
  const sIsStr = stringTypes.some(t => normS.includes(t));
  const tIsStr = stringTypes.some(t => normT.includes(t));
  const sIsDate = dateTypes.some(t => normS.includes(t));
  const tIsDate = dateTypes.some(t => normT.includes(t));
  
  if (normS === normT) return 1.0;
  if ((sIsNum && tIsNum) || (sIsStr && tIsStr) || (sIsDate && tIsDate)) return 0.9;
  if ((sIsNum && tIsStr) || (sIsStr && tIsNum)) return 0.5;
  
  return 0.3;
}

function descriptionSimilarity(sourceDesc, targetDesc) {
  if (!sourceDesc || !targetDesc) return 0;
  
  const sourceWords = normalizeText(sourceDesc).split(/\s+/).filter(w => w.length > 3);
  const targetWords = normalizeText(targetDesc).split(/\s+/).filter(w => w.length > 3);
  
  if (sourceWords.length === 0 || targetWords.length === 0) return 0;
  
  let matchCount = 0;
  for (const sw of sourceWords) {
    if (targetWords.some(tw => tw === sw || tw.includes(sw) || sw.includes(tw))) {
      matchCount++;
    }
  }
  
  return matchCount / Math.max(sourceWords.length, targetWords.length);
}

function valueSimilarity(sourceValues, targetValues) {
  if (!sourceValues || !targetValues) return 0;
  
  const normS = normalizeText(sourceValues);
  const normT = normalizeText(targetValues);
  
  if (normS === normT) return 1.0;
  
  const extractValues = (str) => {
    const matches = str.match(/[a-z0-9]+/gi);
    return matches ? matches.map(normalizeText) : [];
  };
  
  const sVals = extractValues(sourceValues);
  const tVals = extractValues(targetValues);
  
  if (sVals.length === 0 || tVals.length === 0) return 0;
  
  let matchCount = 0;
  for (const sv of sVals) {
    if (tVals.includes(sv)) matchCount++;
  }
  
  const partialMatch = matchCount / Math.max(sVals.length, tVals.length);
  
  return partialMatch > 0 ? partialMatch * 0.7 : 0;
}

function suggestValueTranslations(sourceValues, targetValues) {
  if (!sourceValues || !targetValues) return [];
  
  const extractPairs = (str) => {
    const pairs = [];
    const patterns = [
      /([a-z0-9]+)\s*[=:]\s*([^,;]+)/gi,
      /([yn01])\s*[-=]>\s*([^,;]+)/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(str)) !== null) {
        pairs.push({ key: match[1].trim(), label: match[2].trim() });
      }
    }
    
    return pairs;
  };
  
  const sPairs = extractPairs(sourceValues);
  const tPairs = extractPairs(targetValues);
  
  if (sPairs.length === 0 || tPairs.length === 0) return [];
  
  const translations = [];
  for (const sp of sPairs) {
    for (const tp of tPairs) {
      if (normalizeText(sp.label).includes(normalizeText(tp.label)) ||
          normalizeText(tp.label).includes(normalizeText(sp.label))) {
        translations.push(`${sp.key} -> ${tp.key}`);
      }
    }
  }
  
  return translations;
}

export function generateHeuristicSuggestions(sourceSchema, targetSchema, existingMappings) {
  const suggestions = [];
  const existingKeys = new Set(
    existingMappings.map(m => `${m.sourceTable}.${m.sourceColumn}::${m.targetTable}.${m.targetColumn}`)
  );
  
  for (const sourceTable of sourceSchema.tables || []) {
    for (const sourceCol of sourceTable.columns || []) {
      for (const targetTable of targetSchema.tables || []) {
        for (const targetCol of targetTable.columns || []) {
          const key = `${sourceTable.name}.${sourceCol.name}::${targetTable.name}.${targetCol.name}`;
          if (existingKeys.has(key)) continue;
          
          const nameSim = similarity(sourceCol.name, targetCol.name);
          const typeSim = typeCompatibility(sourceCol.type, targetCol.type);
          const descSim = descriptionSimilarity(sourceCol.description, targetCol.description);
          const valSim = valueSimilarity(sourceCol.values, targetCol.values);
          
          const weights = { name: 0.5, type: 0.2, desc: 0.2, val: 0.1 };
          const score = 
            nameSim * weights.name +
            typeSim * weights.type +
            descSim * weights.desc +
            valSim * weights.val;
          
          if (score >= 0.4) {
            const reasons = [];
            if (nameSim > 0.7) reasons.push('column names match');
            if (typeSim > 0.8) reasons.push('compatible types');
            if (descSim > 0.3) reasons.push('similar definitions');
            if (valSim > 0.5) reasons.push('overlapping value formats');
            
            const translations = suggestValueTranslations(sourceCol.values, targetCol.values);
            
            suggestions.push({
              sourceTable: sourceTable.name,
              sourceColumn: sourceCol.name,
              targetTable: targetTable.name,
              targetColumn: targetCol.name,
              confidence: Math.round(score * 100) / 100,
              reason: reasons.length > 0 ? reasons.join(', ') : 'potential match based on analysis',
              valueTranslations: translations,
              method: 'heuristic',
            });
          }
        }
      }
    }
  }
  
  suggestions.sort((a, b) => b.confidence - a.confidence);
  
  return suggestions;
}

export async function generateLLMSuggestions(sourceSchema, targetSchema, existingMappings, settings) {
  if (!settings.apiKey) {
    throw new Error('API key not configured. Open Settings to add your OpenAI-compatible API key.');
  }
  
  const existingKeys = new Set(
    existingMappings.map(m => `${m.sourceTable}.${m.sourceColumn}::${m.targetTable}.${m.targetColumn}`)
  );
  
  const schemaToPrompt = (schema, label) => {
    return schema.tables.map(t => 
      `${label} Table: ${t.name}\n` +
      t.columns.map(c => 
        `  - ${c.name} (${c.type})${c.description ? `: ${c.description}` : ''}${c.values ? ` [values: ${c.values}]` : ''}`
      ).join('\n')
    ).join('\n\n');
  };
  
  const prompt = `You are an expert data migration consultant. Given the source and target schemas below, suggest column mappings between them.

${schemaToPrompt(sourceSchema, 'SOURCE')}

${schemaToPrompt(targetSchema, 'TARGET')}

For each suggested mapping, provide:
1. sourceTable, sourceColumn, targetTable, targetColumn
2. confidence (0.0-1.0)
3. reason (one sentence explaining why this mapping makes sense)
4. valueTranslations (array of strings like "1 -> Y", "0 -> N" when value formats differ)

Return ONLY a JSON array of mapping objects. No other text. Example format:
[
  {
    "sourceTable": "mig_pupil",
    "sourceColumn": "pupil_id",
    "targetTable": "Pupil_Template",
    "targetColumn": "PUPIL_REF",
    "confidence": 0.95,
    "reason": "Both are primary pupil identifiers",
    "valueTranslations": []
  }
]`;

  const response = await fetch(`${settings.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: 'You are a data migration expert. Return only valid JSON arrays.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API error (${response.status}): ${error}`);
  }
  
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error('No response from LLM');
  }
  
  let suggestions;
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    suggestions = JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (e) {
    throw new Error('LLM returned invalid JSON. Try again or use heuristic mode.');
  }
  
  const filtered = suggestions
    .filter(s => {
      const key = `${s.sourceTable}.${s.sourceColumn}::${s.targetTable}.${s.targetColumn}`;
      return !existingKeys.has(key);
    })
    .map(s => ({
      ...s,
      method: 'llm',
      confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0)),
      valueTranslations: Array.isArray(s.valueTranslations) ? s.valueTranslations : [],
    }));
  
  return filtered;
}
