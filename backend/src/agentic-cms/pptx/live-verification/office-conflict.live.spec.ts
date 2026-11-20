import * as JSZip from 'jszip';
import type { DeckContent } from '../pptx.types';
import {
  CONCURRENT_EDIT_MARKER, deriveConcurrentEdit, sha256, staleWriteRejected, verificationFindings, type StaleWriteObservation,
} from './office-conflict.live';

const shape = (spId: string, type: 'title' | 'body', creationId?: string) =>
  ({ spId, name: `Shape ${spId}`, type, hasCreationId: !!creationId, creationId, text: 'x' });

const deck: DeckContent = {
  slideCount: 2,
  slides: [
    { index: 1, sldId: '256', slideFile: 'slides/slide1.xml', hidden: false, title: 'A', bodyText: [], speakerNotes: '', shapes: [shape('2', 'title', '{T}'), shape('3', 'body', '{B}')] },
    { index: 2, sldId: '257', slideFile: 'slides/slide2.xml', hidden: false, title: 'B', bodyText: [], speakerNotes: '', shapes: [shape('2', 'title')] },
  ],
};

describe('office conflict live verification helpers', () => {
  it('derives deck B by marking only the last slide', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', '<p:sld><a:t>first</a:t></p:sld>');
    zip.file('ppt/slides/slide2.xml', '<p:sld><a:t>last</a:t><a:t>more</a:t></p:sld>');
    const a = await zip.generateAsync({ type: 'nodebuffer' });
    const b = await JSZip.loadAsync(await deriveConcurrentEdit(a, deck));
    expect(await b.file('ppt/slides/slide1.xml')!.async('string')).toBe('<p:sld><a:t>first</a:t></p:sld>');
    expect(await b.file('ppt/slides/slide2.xml')!.async('string')).toBe(`<p:sld><a:t>${CONCURRENT_EDIT_MARKER}: last</a:t><a:t>more</a:t></p:sld>`);
  });

  it('targets a body shape with a creationId and the last slide', () => {
    const [onShape, onSlide] = verificationFindings(deck);
    expect(onShape).toMatchObject({ slideIndex: 1, shapeId: '3' });
    expect(onSlide).toMatchObject({ slideIndex: 2 });
    expect(onSlide.shapeId).toBeUndefined();
  });

  it('refuses decks whose first slide has no creation IDs', () => {
    const bare = { ...deck, slides: [{ ...deck.slides[0], shapes: [shape('3', 'body')] }, deck.slides[1]] };
    expect(() => verificationFindings(bare)).toThrow(/creationId/);
  });

  it('passes only when the stale write got 412 and B is untouched', () => {
    const b = sha256(Buffer.from('B'));
    const ok: StaleWriteObservation = { staleUploadStatus: 412, eTagAfterEdit: '"x,2"', eTagAfterStaleAttempt: '"x,2"', shaB: b, shaAfterStaleAttempt: b, commentPartsAfterStaleAttempt: 0 };
    expect(staleWriteRejected(ok)).toBe(true);
    expect(staleWriteRejected({ ...ok, staleUploadStatus: 200 })).toBe(false);
    expect(staleWriteRejected({ ...ok, eTagAfterStaleAttempt: '"x,3"' })).toBe(false);
    expect(staleWriteRejected({ ...ok, shaAfterStaleAttempt: sha256(Buffer.from('A')) })).toBe(false);
    expect(staleWriteRejected({ ...ok, commentPartsAfterStaleAttempt: 1 })).toBe(false);
  });
});
