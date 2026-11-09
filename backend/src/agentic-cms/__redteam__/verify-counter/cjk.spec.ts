import { countDraftWords, requestedWordLimit } from '../../agent/word-limit';
it('cjk', () => {
  console.log(countDraftWords('这是一个没有空格的中文句子用于测试字数统计'), countDraftWords('日本語の文章はスペースがありません'), countDraftWords('字'.repeat(400)));
  console.log(requestedWordLimit('Write a 100-word summary'), requestedWordLimit('写一篇100字的摘要'));
});
