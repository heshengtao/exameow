/**
 * 选项文本工具
 *
 * 题库里的选项有时会自带编号(如 AI 生成、OCR 识别、第三方导入的数据存成
 * "A. 选项内容"),而渲染时(练习卡 / 考试页 / AI 对话 / Word 导出)又会按位置
 * 重新生成一遍编号,结果就成了 "A. A. 选项内容"。
 *
 * 这里统一剥掉选项文本自带的编号,渲染端只负责生成编号。
 */

/** 选项编号字母,按位置取用 */
export const OPTION_LETTERS = 'ABCDEFGH'

/**
 * 选项编号前缀:可选的左括号 + 字母 + 分隔符
 * 兼容 "A." / "A、" / "A．" / "A:" / "A)" / "(A)" / "（A）" 等常见写法
 */
const OPTION_PREFIX_RE = /^\s*[（(]?\s*[A-Ha-h]\s*[.、．:：)）]\s*/

/**
 * 剥掉选项文本自带的编号,避免与渲染时生成的编号重复成 "A. A. xxx"。
 *
 * - 不校验字母是否与当前位置一致:练习模式会打乱选项顺序(practice.ts 的
 *   shuffled),打乱后 "B." 可能落在 A 位,此时同样应该剥掉。
 * - 循环剥离,兼容 "A. A. xxx" 这类多层重复。
 * - 剥完为空则回退原文,避免选项内容只剩 "A." 时渲染成空白。
 */
export function stripOptionLabel(text: string): string {
  const source = (text ?? '').trim()
  if (!source) return ''

  let out = source
  for (;;) {
    const matched = OPTION_PREFIX_RE.exec(out)
    if (!matched) break
    out = out.slice(matched[0].length)
  }

  out = out.trim()
  return out || source
}
