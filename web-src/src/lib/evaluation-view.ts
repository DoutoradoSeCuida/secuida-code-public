import type { Attempt } from '../types/sdk';

// A reopened or resubmitted attempt can retain its previous decision for audit.
// Only terminal states describe the current submission to the student.
export function evaluationView(attempt: Attempt) {
  const finished = attempt.data.status === 'validated' || attempt.data.status === 'rejected' || attempt.data.status === 'revise';
  return {
    feedback: finished ? attempt.data.feedback : undefined,
    grade: finished && attempt.data.assessment?.rubric_version !== 2 ? attempt.data.grade : undefined,
  };
}
