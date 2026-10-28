/**
 * Enterprise Address Matching & Normalization Engine for WhatsApp Commerce OS
 * Handles English, Hinglish, voice-to-text typos, button payloads, and natural affirmations.
 */

export interface ParsedAddress {
  name?: string;
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
}

const COMMON_INDIAN_CITIES = [
  'bengaluru', 'bangalore', 'mumbai', 'delhi', 'new delhi', 'hyderabad',
  'chennai', 'madras', 'kolkata', 'calcutta', 'pune', 'ahmedabad', 'jaipur',
  'lucknow', 'surat', 'gurgaon', 'gurugram', 'noida', 'greater noida',
  'ghaziabad', 'faridabad', 'chandigarh', 'indore', 'bhopal', 'nagpur',
  'patna', 'vadodara', 'coimbatore', 'kochi', 'cochin', 'thiruvananthapuram',
  'mysuru', 'mysore', 'visakhapatnam', 'vizag', 'vijayawada', 'bhubaneswar',
  'kanpur', 'varanasi', 'agra', 'dehradun', 'ludhiana', 'amritsar',
];

const ADDRESS_INDICATOR_WORDS = [
  'flat', 'apartment', 'apt', 'house', 'building', 'bldg', 'floor',
  'street', 'road', 'rd', 'cross', 'main', 'colony', 'nagar', 'layout',
  'sector', 'block', 'lane', 'nilaya', 'nivas', 'bhavan', 'society',
  'tower', 'opp', 'opposite', 'near', 'behind', 'beside', 'phase',
  'stage', 'extension', 'extn', 'post', 'dist', 'district', 'pincode',
  'pin code', 'pin', 'zip', 'door no', 'd no', 'plot', 'survey',
];

/**
 * Checks if the user's message is an explicit confirmation of their delivery address.
 * Robust against Hinglish, typos ("dilbar"), button payloads, and natural affirmations.
 */
export function isAddressConfirmation(
  rawMessage: string,
  currentStage?: string,
  lastAssistantMessage?: string
): boolean {
  if (!rawMessage || typeof rawMessage !== 'string') return false;
  const msg = rawMessage.trim().toLowerCase();

  // 1. Exact button IDs or UI button text
  if (
    msg === 'confirm_address' ||
    msg === 'proceed_to_pay' ||
    msg === 'deliver_here' ||
    msg === 'yes' ||
    msg === 'yep' ||
    msg === 'yeah' ||
    msg === 'ha' ||
    msg === 'haan' ||
    msg === 'haanji' ||
    msg === 'hu' ||
    msg === 'huu' ||
    msg === 'haudhu' ||
    msg === 'sari' ||
    msg === 'sarri' ||
    msg === 'ok' ||
    msg === 'okay' ||
    msg === 'correct' ||
    msg === 'corect' ||
    msg === 'right' ||
    msg === 'proceed' ||
    msg === 'confirm' ||
    msg === 'pay' ||
    msg === 'done' ||
    msg.includes('deliver here') ||
    msg.includes('proceed to pay')
  ) {
    return true;
  }

  // 2. Guard against negation/change requests (e.g. "no, change address", "different address")
  // BUT allow "no change", "no different address"
  const isNoChangePhrase = /\b(no change|no different|without change|nothing to change)\b/i.test(msg);
  const isChangeRequest = /\b(change address|different address|new address|update address|wrong address|don't deliver|do not deliver|not this)\b/i.test(msg);

  if (isChangeRequest && !isNoChangePhrase) {
    return false;
  }

  // 2B. Direct regex check for address correctness (handles "address is corect", "address correct", etc.)
  if (/(address|details|info)\s+(is\s+)?(co[r]+ect|right|ok|okay|fine|good|same|confirmed|valid)/i.test(msg)) {
    return true;
  }

  // 3. Address confirmation phrases in natural language
  const confirmationPhrases = [
    // Standard English & Typos
    'address is correct',
    'address is corect',
    'address is right',
    'address correct',
    'address corect',
    'address right',
    'correct address',
    'corect address',
    'right address',
    'same address',
    'use same address',
    'use this address',
    'use my saved address',
    'use saved address',
    'deliver to this address',
    'deliver to that address',
    'deliver to the address',
    'deliver to same address',
    'deliver to that same address',
    'deliver to my address',
    'send to this address',
    'send to same address',
    'ship to this address',
    'ship to same address',
    'deliver here',
    'send here',
    'ship here',
    'no change in address',
    'no change or no different',
    'that is correct',
    'this is correct',
    'looks good',
    'all good',
    'perfect',
    'fine with this address',
    'deliver there',
    // Voice-to-text / Typo handling (very common on Indian WhatsApp)
    'dilbar to that same address',
    'dilbar to this address',
    'dilbar to same address',
    'delver to that same address',
    'delver to this address',
    'diliver to that same address',
    'dilbar to the address',
    // Hinglish / Kannada phrases
    'yahi address',
    'yahi pe deliver',
    'yahi deliver karo',
    'isi address pe',
    'sahi hai',
    'theek hai',
    'idhe address',
    'illiye kalsu',
    'illiye deliver madi',
  ];

  for (const phrase of confirmationPhrases) {
    if (msg.includes(phrase)) {
      return true;
    }
  }

  // 4. If current stage is CHECKOUT_CONFIRM or last assistant message asked for address confirmation:
  const isConfirmContext =
    currentStage === 'CHECKOUT_CONFIRM' ||
    (lastAssistantMessage &&
      /deliver to this address|delivery address on file|confirm your delivery address|deliver here|use a different delivery address/i.test(
        lastAssistantMessage
      ));

  if (isConfirmContext) {
    // If user says "yes...", "correct...", "corect...", "hu...", "ha...", "deliver...", "dilbar...", "confirm...", "proceed..."
    if (
      /^(yes|ha|haan|hu|huu|haudhu|yep|yeah|sure|correct|corect|proceed|confirm|ok|okay|fine|done|pay|checkout|order)\b/i.test(msg) ||
      /\b(deliver|dilbar|delver|ship|send)\b/i.test(msg) ||
      isNoChangePhrase
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if the user is requesting to change or provide a different address.
 */
export function isAddressChangeRequest(rawMessage: string): boolean {
  if (!rawMessage || typeof rawMessage !== 'string') return false;
  const msg = rawMessage.trim().toLowerCase();

  // Button payload
  if (msg === 'change_address' || msg.includes('change address')) {
    // But check if user said "no change address"
    if (/\b(no change|no different)\b/i.test(msg)) {
      return false;
    }
    return true;
  }

  if (/\b(no change|no different|without change)\b/i.test(msg)) {
    return false;
  }

  const changePatterns = [
    /\b(change address|different address|new address|update address|wrong address)\b/i,
    /\b(deliver to another|send to another|ship to another|use another address|use different address)\b/i,
    /\b(not this address|change my address|update my address|change delivery)\b/i,
    /\b(address is wrong|address badal do|dusra address)\b/i,
  ];

  return changePatterns.some((pattern) => pattern.test(msg));
}

/**
 * Robustly parses and extracts structured delivery address details from natural text.
 * Returns null if the text does not contain address characteristics.
 */
export function extractDeliveryAddress(
  rawText: string,
  defaultName?: string
): ParsedAddress | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // If this is just a short confirmation or query, skip
  if (text.length < 10) return null;
  if (/^(yes|no|ok|okay|hello|hi|hey|thanks|thank you|what|how|show|tell)\b/i.test(text) && text.length < 35) {
    return null;
  }

  // 1. Extract 6-digit Indian PIN code
  const pinMatch = text.match(/\b([1-9][0-9]{5})\b/);
  const pincode = pinMatch ? pinMatch[1] : undefined;

  // 2. Check for address indicators or city names
  const hasIndicators = ADDRESS_INDICATOR_WORDS.some((term) => lower.includes(term));
  const hasCity = COMMON_INDIAN_CITIES.some((city) => lower.includes(city));
  const hasDigits = /\d+/.test(text);

  // Address confidence score
  let confidence = 0;
  if (pincode) confidence += 3;
  if (hasIndicators) confidence += 2;
  if (hasCity) confidence += 2;
  if (hasDigits) confidence += 1;
  if (text.includes('\n')) confidence += 2; // Multi-line address is strong signal

  // If score < 3, not a valid address
  if (confidence < 3) {
    return null;
  }

  // 3. Extract city if present
  let detectedCity: string | undefined;
  for (const city of COMMON_INDIAN_CITIES) {
    if (new RegExp(`\\b${city}\\b`, 'i').test(lower)) {
      detectedCity = city.charAt(0).toUpperCase() + city.slice(1);
      break;
    }
  }

  // 4. Extract recipient name
  let detectedName = defaultName;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  if (lines.length >= 2) {
    const firstLine = lines[0];
    // If first line has 2-4 words, no digits, and is relatively short (< 35 chars), it's likely a name
    if (firstLine && firstLine.length < 35 && !/\d/.test(firstLine) && !ADDRESS_INDICATOR_WORDS.some((w) => firstLine.toLowerCase().includes(w))) {
      detectedName = firstLine;
    }
  } else {
    // Check for "Name: ...", "Deliver to: ..."
    const nameMatch = text.match(/(?:name|deliver to|recipient)\s*[:\-]\s*([a-zA-Z\s]{3,35})/i);
    if (nameMatch && nameMatch[1]) {
      detectedName = nameMatch[1].trim();
    }
  }

  return {
    name: detectedName,
    address: text,
    city: detectedCity,
    pincode,
  };
}
