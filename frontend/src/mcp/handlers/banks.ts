import type { QuestionBank } from '@exameow/shared'
import { usePracticeStore } from '@/stores/practice'
import { McpToolError, registerMcpTool } from '../registry'
import {
  argNumber,
  argString,
  bankSummary,
  newId,
  normalizeQuestions,
} from '../helpers'

export function registerBankTools(): void {
  registerMcpTool('list_banks', () => {
    const practice = usePracticeStore()
    return { banks: practice.banks.map(bankSummary), total: practice.banks.length }
  })

  registerMcpTool('get_bank', (args) => {
    const practice = usePracticeStore()
    const bankId = argString(args, 'bank_id', true)!
    const bank = practice.getBank(bankId)
    if (!bank) throw new McpToolError('not_found', `bank \`${bankId}\` does not exist`)
    const offset = argNumber(args, 'offset', 0, 0, bank.questions.length)
    const limit = argNumber(args, 'limit', 200, 1, 1000)
    return {
      bank: bankSummary(bank),
      total: bank.questions.length,
      offset,
      questions: bank.questions.slice(offset, offset + limit),
    }
  })

  registerMcpTool('create_bank', (args) => {
    const practice = usePracticeStore()
    const name = argString(args, 'name', true)!
    const questions = normalizeQuestions(args.questions)
    if (questions.length === 0) {
      throw new McpToolError('invalid_args', '`questions` must not be empty')
    }
    const bank: QuestionBank = {
      id: newId('bank'),
      name,
      questions,
      createdAt: Date.now(),
      source: 'ai-generated',
    }
    practice.addBank(bank)
    return { bank_id: bank.id, name: bank.name, count: questions.length }
  })

  registerMcpTool('add_questions_to_bank', (args) => {
    const practice = usePracticeStore()
    const bankId = argString(args, 'bank_id', true)!
    const bank = practice.getBank(bankId)
    if (!bank) throw new McpToolError('not_found', `bank \`${bankId}\` does not exist`)
    const questions = normalizeQuestions(args.questions, bankId)
    if (questions.length === 0) {
      throw new McpToolError('invalid_args', '`questions` must not be empty')
    }
    const merged = [...bank.questions, ...questions]
    practice.updateBank(bankId, { questions: merged })
    return { bank_id: bankId, added: questions.length, count: merged.length }
  })

  registerMcpTool('delete_bank', (args) => {
    const practice = usePracticeStore()
    const bankId = argString(args, 'bank_id', true)!
    if (args.confirm !== true) {
      throw new McpToolError(
        'confirm_required',
        'Deleting a bank removes its questions and practice progress. Pass confirm=true to proceed.',
      )
    }
    if (!practice.getBank(bankId)) {
      throw new McpToolError('not_found', `bank \`${bankId}\` does not exist`)
    }
    practice.removeBank(bankId)
    return { ok: true, bank_id: bankId }
  })

  registerMcpTool('search_bank_questions', (args) => {
    const practice = usePracticeStore()
    const query = argString(args, 'query', true)!.toLowerCase()
    const limit = argNumber(args, 'limit', 20, 1, 200)
    const onlyBank = argString(args, 'bank_id')
    const banks = onlyBank
      ? practice.banks.filter(bank => bank.id === onlyBank)
      : practice.banks
    const results: {
      bank_id: string
      bank_name: string
      question_id: string
      type: string
      stem: string
    }[] = []

    for (const bank of banks) {
      for (const question of bank.questions) {
        if (!question.stem.toLowerCase().includes(query)) continue
        results.push({
          bank_id: bank.id,
          bank_name: bank.name,
          question_id: question.id,
          type: question.type,
          stem: question.stem,
        })
        if (results.length >= limit) {
          return { results, truncated: true, query }
        }
      }
    }
    return { results, truncated: false, query }
  })
}
