import { randomUUID } from 'node:crypto';
import { documentSchema, ResearchDocument } from './research.schemas';
import { ResearchEditOperation } from './research-edit.schemas';

export class ResearchEditError extends Error {}
const fail = (message: string): never => { throw new ResearchEditError(message); };
const urls = (text: string) => text.match(/https?:\/\/[^\s<>"\]]+/g)?.map(s => s.replace(/[).,;!?]+$/, '')) ?? [];
function reorder<T extends { id: string }>(items: T[], ids: string[]) {
  if (ids.length !== items.length || new Set(ids).size !== ids.length || ids.some(id => !items.some(item => item.id === id))) fail('Reordering must contain every existing ID exactly once.');
  return ids.map(id => items.find(item => item.id === id)!);
}

/** Applies a bounded patch to one authorized document; the model never writes a replacement document. */
export function applyResearchEdits(original: ResearchDocument, operations: ResearchEditOperation[]) {
  const doc = structuredClone(original); const changes: string[] = [];
  const aliases = new Map<string, string>();
  const existingIds = new Set([...doc.sections.map(s => s.id), ...doc.sources.map(s => s.id), ...(doc.framework?.buckets.flatMap(b => [b.id, ...b.questions.map(q => q.id)]) ?? [])]);
  const resolve = (id: string) => aliases.get(id) ?? id;
  const create = (ref: string) => { if (aliases.has(ref) || existingIds.has(ref)) fail('New references must be unique and not reuse an existing ID.'); const id = randomUUID(); aliases.set(ref, id); return id; };
  const tree = () => doc.framework ??= { objective: '', buckets: [], assumptions: [], clarificationQuestions: [] };
  const bucket = (id: string) => tree().buckets.find(b => b.id === resolve(id)) ?? fail('Unknown bucket ID.');
  const question = (id: string) => tree().buckets.flatMap(b => b.questions).find(q => q.id === resolve(id)) ?? fail('Unknown question ID.');
  const section = (id: string) => doc.sections.find(s => s.id === id) ?? fail('Unknown section ID.');
  const knownUrls = new Set(urls(JSON.stringify(original)));
  // Source URLs may have JSON-escaped characters in the full snapshot.
  original.sources.forEach(s => urls(s.url).forEach(url => knownUrls.add(url)));
  original.sections.forEach(s => urls(s.content).forEach(url => knownUrls.add(url)));
  for (const op of operations) {
    switch (op.kind) {
      case 'set_section': {
        const s = section(op.sectionId);
        if (op.title === undefined && op.content === undefined && op.sourceIds === undefined) fail('Supply an actual section change.');
        if (op.title !== undefined) {
          if (s.frameworkQuestionId) fail('Rename linked Findings headings with edit_question.');
          s.title = op.title;
        }
        if (op.content !== undefined) {
          if (urls(op.content).some(url => !knownUrls.has(url))) fail('Editing cannot introduce new source URLs; use bucket research for new evidence.');
          s.content = op.content;
        }
        if (op.sourceIds !== undefined) {
          if (op.sourceIds.some(id => !doc.sources.some(source => source.id === id))) fail('Only saved source IDs can be cited.');
          s.sourceIds = [...new Set(op.sourceIds)];
        }
        changes.push(`Edited ${s.title}`); break;
      }
      case 'clear_section': { const s = section(op.sectionId); s.content = ''; s.sourceIds = []; changes.push(`Cleared ${s.title}`); break; }
      case 'set_objective': tree().objective = op.objective; changes.push('Updated the research objective'); break;
      case 'add_bucket': tree().buckets.push({ id: create(op.ref), title: op.title, questions: [] }); changes.push(`Added bucket: ${op.title}`); break;
      case 'rename_bucket': { const b = bucket(op.bucketId); changes.push(`Renamed bucket: ${b.title} → ${op.title}`); b.title = op.title; break; }
      case 'remove_bucket': { const b = bucket(op.bucketId); tree().buckets = tree().buckets.filter(item => item.id !== b.id); changes.push(`Removed bucket: ${b.title}`); break; }
      case 'add_question': { const b = bucket(op.bucketId); b.questions.push({ id: create(op.ref), title: op.title, evidence: op.evidence }); changes.push(`Added question: ${op.title}`); break; }
      case 'edit_question': { const q = question(op.questionId); if (op.title === undefined && op.evidence === undefined) fail('Supply a question change.'); if (op.title !== undefined) q.title = op.title; if (op.evidence !== undefined) q.evidence = op.evidence; changes.push(`Edited question: ${q.title}`); break; }
      case 'remove_question': { const q = question(op.questionId); tree().buckets.forEach(b => { b.questions = b.questions.filter(item => item.id !== q.id); }); changes.push(`Removed question: ${q.title}`); break; }
      case 'reorder_buckets': tree().buckets = reorder(tree().buckets, op.ids.map(resolve)); changes.push('Reordered framework buckets'); break;
      case 'reorder_questions': { const b = bucket(op.bucketId); b.questions = reorder(b.questions, op.ids.map(resolve)); changes.push(`Reordered questions in ${b.title}`); break; }
    }
  }
  const questions = doc.framework?.buckets.flatMap(b => b.questions) ?? [];
  doc.sections = doc.sections.flatMap(s => {
    if (!s.frameworkQuestionId) return [s];
    const q = questions.find(q => q.id === s.frameworkQuestionId);
    if (q) return [{ ...s, title: q.title }];
    // Removing a heading cannot erase its previous findings, even if a bad patch
    // also tried to clear it. Explicitly clearing a retained question is allowed.
    const kept = { ...(original.sections.find(old => old.id === s.id) ?? s) };
    if (!kept.content.trim() && !kept.sourceIds.length) return [];
    delete kept.frameworkQuestionId;
    kept.title = `Unassigned findings — ${kept.title}`.slice(0, 300);
    changes.push(`Kept existing content as ${kept.title}`); return [kept];
  });
  for (const q of questions) if (!doc.sections.some(s => s.frameworkQuestionId === q.id)) {
    doc.sections.push({ id: `finding_${q.id}`, tab: 'findings', title: q.title, content: '', sourceIds: [], frameworkQuestionId: q.id });
  }
  const linked = new Map(doc.sections.filter(s => s.frameworkQuestionId).map(s => [s.frameworkQuestionId, s]));
  doc.sections = [...doc.sections.filter(s => !s.frameworkQuestionId), ...questions.map(q => linked.get(q.id)!)];
  const validated = documentSchema.safeParse(doc);
  if (!validated.success) fail('The edits violate document size, framework limits, or citation/link requirements.');
  return { document: validated.data, changes: [...new Set(changes)] };
}
