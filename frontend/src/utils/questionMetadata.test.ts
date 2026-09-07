import { Difficulty, QuestionType } from '@exameow/shared'
import { tagQuestions } from './questionMetadata.ts'

const questions = [{
  id: 'q1',
  type: QuestionType.SingleChoice,
  stem: 'Question',
  options: ['A'],
  answer: 'A',
  analysis: '',
}]

const tagged = tagQuestions(
  questions,
  '## Imported file\nContent',
  'fallback.txt',
  'Physics',
  'Chapter 3',
  Difficulty.Hard,
)

if (tagged[0]?.subject !== 'Physics') throw new Error('subject should remain subject metadata')
if (tagged[0]?.chapter !== 'Chapter 3') throw new Error('topic filter should become chapter metadata')
if (tagged[0]?.difficulty !== Difficulty.Hard) throw new Error('difficulty should remain difficulty metadata')

for (const [chapter, expected] of [[' Chapter 1 ', 'Chapter 1'], ['', undefined], [undefined, undefined], [42, undefined], [{}, undefined]] as const) {
  const result = tagQuestions([{ ...questions[0]!, chapter: chapter as string }], '## File', 'file.txt', 'Physics', 'Topic', Difficulty.Hard, true)
  if (result[0]?.chapter !== expected) throw new Error('Automatic chapters must survive metadata tagging; invalid values must be omitted')
}
const legacy = tagQuestions(questions, '## File', 'file.txt', '', '', Difficulty.Easy)
if (legacy[0]?.chapter !== 'File') throw new Error('Default tagging must preserve the file label')
