import type { ParsedChatLine } from './types';

const PREFIX_REGEX = /^(\[.+?\]\s*)?([A-Za-z0-9_.-]+|\([^)]+\))\s*:\s*(.*)$/;
const BRACKET_REGEX = /\[[^\]]+\]/g;

export const parseChatLine = (line: string): ParsedChatLine => {
  const trimmed = line.trim();
  const bracketMatches = trimmed.match(BRACKET_REGEX) || [];

  const match = trimmed.match(PREFIX_REGEX);
  if (match) {
    const channelTag = match[1] || '';
    const rawUser = match[2] || '';
    const messageBody = match[3] || '';
    const cleanUsername = rawUser.replace(/^[([<]|[)>\]]$/g, '').trim();

    return {
      raw: trimmed,
      prefix: `${channelTag}${rawUser}:`,
      username: cleanUsername,
      messageBody: messageBody.trim(),
      bracketItems: bracketMatches,
    };
  }

  return {
    raw: trimmed,
    messageBody: trimmed,
    bracketItems: bracketMatches,
  };
};

export const maskBrackets = (
  text: string
): { maskedText: string; tokens: Map<string, string> } => {
  const tokens = new Map<string, string>();
  let counter = 0;

  const maskedText = text.replace(BRACKET_REGEX, (match) => {
    const token = `__BRK_${counter++}__`;
    tokens.set(token, match);
    return token;
  });

  return { maskedText, tokens };
};

export const unmaskBrackets = (text: string, tokens: Map<string, string>): string => {
  let result = text;
  tokens.forEach((original, token) => {
    result = result.split(token).join(original);
  });
  return result;
};
