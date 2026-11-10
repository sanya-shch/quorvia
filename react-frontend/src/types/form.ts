export interface FormSummary {
  id: string;
  title: string;
  description?: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  shareId: string;
  closesAt?: string | null;
  maxResponses?: number | null;
  responseCount?: number;
  _count: {
    questions: number;
    responses: number;
  };
}
