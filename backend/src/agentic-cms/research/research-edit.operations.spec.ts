import { ResearchEditOperation } from './research-edit.schemas';
import { applyResearchEdits } from './research-edit.operations';
import { emptyResearchDocument } from './research.schemas';

const fixture = () => {
  const doc = emptyResearchDocument();
  doc.sources = [{ id: 's1', title: 'Client note', url: 'https://example.test/note' }];
  doc.sections[0] = { ...doc.sections[0], content: 'Long past data', sourceIds: ['s1'] };
  doc.framework = { objective: 'Assess buyers', assumptions: [], clarificationQuestions: [], buckets: [{ id: 'b1', title: 'Buyers', questions: [{ id: 'q1', title: 'Who buys?', evidence: 'Interviews' }] }] };
  doc.sections.push({ id: 'finding_q1', tab: 'findings', title: 'Who buys?', content: 'Saved evidence', sourceIds: ['s1'], frameworkQuestionId: 'q1' });
  return doc;
};
describe('Targeted research edits', () => {
  it('edits across sections and framework while preserving sources and linked findings', () => {
    const original = fixture();
    const result = applyResearchEdits(original, [
      { kind: 'set_section', sectionId: 'past-data', content: 'Short past data' },
      { kind: 'rename_bucket', bucketId: 'b1', title: 'Customers' },
      { kind: 'edit_question', questionId: 'q1', title: 'Who decides?' },
    ]).document;
    expect(result.sections[0].sourceIds).toEqual(['s1']);
    expect(result.sections.find(s => s.id === 'finding_q1')).toEqual({ ...original.sections[3], title: 'Who decides?' });
    expect(result.sources).toEqual(original.sources);
    expect(original.sections[0].content).toBe('Long past data');
  });
  it('preserves nonempty findings as unassigned when headings are removed, even after a clear operation', () => {
    const result = applyResearchEdits(fixture(), [{ kind: 'clear_section', sectionId: 'finding_q1' }, { kind: 'remove_bucket', bucketId: 'b1' }]).document;
    expect(result.sections.find(s => s.id === 'finding_q1')).toMatchObject({ content: 'Saved evidence', sourceIds: ['s1'] });
    expect(result.sections.find(s => s.id === 'finding_q1').frameworkQuestionId).toBeUndefined();
  });
  it('allocates server IDs and creates empty linked findings for new questions', () => {
    const result = applyResearchEdits(fixture(), [{ kind: 'add_bucket', ref: 'new_bucket', title: 'Pricing' }, { kind: 'add_question', ref: 'new_question', bucketId: 'new_bucket', title: 'What price?', evidence: 'Price list' }]).document;
    const q = result.framework.buckets[1].questions[0];
    expect(q.id).not.toBe('new_question');
    expect(result.sections.find(s => s.frameworkQuestionId === q.id)).toMatchObject({ content: '', sourceIds: [] });
  });
  const invalid: { operations: ResearchEditOperation[] }[] = [
    { operations: [{ kind: 'set_section', sectionId: 'unknown', content: 'x' }] },
    { operations: [{ kind: 'set_section', sectionId: 'past-data', sourceIds: ['unknown'] }] },
    { operations: [{ kind: 'set_section', sectionId: 'past-data', content: 'New https://invented.test/fact' }] },
    { operations: [{ kind: 'reorder_buckets', ids: [] }] },
  ];
  it.each(invalid)('rejects invalid patches without mutating the input: %j', ({ operations }) => {
    const original = fixture(); const before = structuredClone(original);
    expect(() => applyResearchEdits(original, operations)).toThrow();
    expect(original).toEqual(before);
  });
});
