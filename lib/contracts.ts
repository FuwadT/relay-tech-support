export type Category = 'performance' | 'network';
export type CaseStatus = 'open' | 'in_progress' | 'resolved' | 'escalated';
export type Answers = Record<string, string>;
export interface CaseRecord {
  id: string;
  title: string;
  description: string;
  deviceName: string;
  category: Category;
  os: 'windows11';
  ownership: 'personal';
  status: CaseStatus;
  answers: Answers;
  notes: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
}
export interface IntakeInput {
  title: string;
  description: string;
  deviceName: string;
  category: Category;
  os: string;
  ownership: string;
  consent: boolean;
}
export interface DiagnosticCheck {
  id: string;
  title: string;
  instruction: string;
  reason: string;
  options: { value: string; label: string }[];
}
export interface Analysis {
  headline: string;
  summary: string;
  findings: string[];
  nextSteps: string[];
  limitations: string[];
}
