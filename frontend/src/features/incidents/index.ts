// Re-export evidence review types and component to avoid case-sensitivity issues
export { EvidenceReview } from './EvidenceReview';
export type { EvidenceImage, ReviewStatus } from './evidenceReviewTypes';
export { reviewStatusLabel, validateReview, reviewPayload, REVIEW_OPTIONS } from './evidenceReviewTypes';
