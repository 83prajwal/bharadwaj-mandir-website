export const MAX_ASSISTANT_QUESTION_LENGTH = 1200

export function getValidAssistantQuestion(value) {
  const content = typeof value === 'string' ? value.trim() : ''
  return content && content.length <= MAX_ASSISTANT_QUESTION_LENGTH ? content : null
}

export function acquireAssistantSubmission(lock) {
  if (lock.current) return false
  lock.current = true
  return true
}

export function releaseAssistantSubmission(lock) {
  lock.current = false
}
