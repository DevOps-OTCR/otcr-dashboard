import type { ResearchDocument, ResearchFramework } from './research-api';

export const blankFramework = (): ResearchFramework => ({ objective: '', buckets: [], assumptions: [], clarificationQuestions: [] });

/** Keep findings attached by ID, never by display title or array position. */
export function chooseFramework(document: ResearchDocument, framework: ResearchFramework): ResearchDocument {
  const chosen = structuredClone(document);
  const questions = framework.buckets.flatMap(b => b.questions);
  chosen.sections = chosen.sections.flatMap(section => {
    if (!section.frameworkQuestionId) return [section];
    const question = questions.find(q => q.id === section.frameworkQuestionId);
    if (question) return [{ ...section, title: question.title }];
    if (!section.content.trim() && !section.sourceIds.length) return [];
    const kept = { ...section };
    delete kept.frameworkQuestionId;
    return [{ ...kept, title: `Unassigned findings — ${section.title}`.slice(0, 300) }];
  });
  for (const question of questions) {
    if (!chosen.sections.some(s => s.frameworkQuestionId === question.id)) {
      chosen.sections.push({ id: `finding_${question.id}`, tab: 'findings', title: question.title, content: '', sourceIds: [], frameworkQuestionId: question.id });
    }
  }
  const linked = new Map(chosen.sections.filter(s => s.frameworkQuestionId).map(s => [s.frameworkQuestionId, s]));
  chosen.sections = [...chosen.sections.filter(s => !s.frameworkQuestionId), ...questions.map(q => linked.get(q.id)!)];
  chosen.framework = framework;
  return chosen;
}
