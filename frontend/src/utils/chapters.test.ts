import { groupChapters } from './chapters.ts'
import type { Question } from '@exameow/shared'
const questions = ['B', ' A ', '', undefined, 'B', '未分章'].map(chapter => ({ chapter }) as Question)
const expected = [{ chapter: 'B', count: 2 }, { chapter: 'A', count: 1 }, { chapter: null, count: 2 }, { chapter: '未分章', count: 1 }]
if (JSON.stringify(groupChapters(questions)) !== JSON.stringify(expected)) throw new Error('Chapter order, counts or normalization differ')
if (groupChapters([]).length) throw new Error('Empty banks must have no chapters')
