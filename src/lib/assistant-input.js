export const MAX_ASSISTANT_QUESTION_LENGTH = 1200

export function getValidAssistantQuestion(value) {
  const content = typeof value === 'string' ? value.trim() : ''
  return content && content.length <= MAX_ASSISTANT_QUESTION_LENGTH ? content : null
}

export function getQuickAssistantReply(value) {
  const content = typeof value === 'string' ? value.trim() : ''
  if (!/^(?:hi+|hell?o|he+y|hiya|namaste|good\s+(?:morning|afternoon|evening))(?:\s+there)?[.!?,\s]*$/i.test(content)) return null
  return 'Hello! I’m Bharadwaj Mandir’s AI assistant. What can I help you with today?'
}

export function acquireAssistantSubmission(lock) {
  if (lock.current) return false
  lock.current = true
  return true
}

export function releaseAssistantSubmission(lock) {
  lock.current = false
}
