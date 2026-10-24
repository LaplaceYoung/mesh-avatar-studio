export type ProductionStage = {
  id: 'source' | 'regions' | 'draft' | 'rig' | 'layers' | 'review';
  state: 'missing' | 'observed' | 'invalid';
  files: string[];
  issues: string[];
  reviewed?: string[];
  required?: string[];
  reviewedFiles?: Record<string, string[]>;
  regionSummary?: ProductionRegionSummary[];
};
export type ProductionRegionSummary = { name: string; confidence: 'low' | 'medium' | 'high'; step: number; core: boolean; detailReviewed: boolean; gridReviewed: boolean };
export type ProductionNextAction = { stage: ProductionStage['id']; reason: string; instruction: string };
export type ProductionStatus = { project: string; projectExists: boolean; checkedAt: string; stages: ProductionStage[]; previewAvailable: boolean; visualReview: 'unverified' | 'approved'; visualReviewAt?: string; nextAction?: ProductionNextAction };
export type CreationTask = { projectName: string; source: string };
export type ProductionActivity = { projectName: string; state: 'starting' | 'working' | 'completed' | 'failed'; message?: string; at: string };
