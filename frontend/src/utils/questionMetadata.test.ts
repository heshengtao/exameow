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
