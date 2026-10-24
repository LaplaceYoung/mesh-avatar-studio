export type ProductionStage = {
  id: 'source' | 'regions' | 'draft' | 'rig' | 'layers' | 'review';
  state: 'missing' | 'observed' | 'invalid';
  files: string[];
  issues: string[];
};
export type ProductionStatus = { project: string; projectExists: boolean; checkedAt: string; stages: ProductionStage[]; previewAvailable: boolean; visualReview: 'unverified' | 'approved'; visualReviewAt?: string };
export type CreationTask = { projectName: string; source: string };
export type ProductionActivity = { projectName: string; state: 'starting' | 'working' | 'completed' | 'failed'; message?: string; at: string };
