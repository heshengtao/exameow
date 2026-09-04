use crate::exam::{Difficulty, ExamParams, QuestionType};
use crate::error::CoreError;
use crate::ai::AIClient;
use crate::exam::Question;

pub fn build_system_prompt() -> String {
    format!(
        r#"You are an expert exam question generator. Generate questions based on the provided document content.

## Critical Rules (MUST follow)
- EVERY question MUST be unique — do NOT generate two questions that test the same concept, fact, or sentence.
- Cover DIFFERENT parts of the document for each question. Avoid clustering questions on the same paragraph.
- Vary question wording, angles, and tested knowledge points.
- When the question stem or analysis refers to the document, ALWAYS use the specific document name provided — NEVER use vague phrases like "the document", "the text", "the passage", "the article", or "the material".

## Output Rules
1. Respond ONLY with a valid JSON array — no explanation, no markdown fences.
2. Each question object MUST have exactly these fields:
   - "id": a short unique identifier string
   - "type": one of [{}]
   - "stem": the question text
   - "options": array of option strings (required for single_choice/multi_choice/true_false; empty array for others)
   - "answer": the correct answer
   - "analysis": brief explanation of the answer (can be empty string for fill_blank/short_answer)
3. For single_choice: exactly 4 options, one correct.
4. For multi_choice: exactly 4 options, at least one correct (list correct letters separated by comma in answer).
5. For true_false: options ["True", "False"], answer is "True" or "False".
6. For fill_blank: answer is the exact word/phrase to fill in.
7. For short_answer: answer is a concise reference answer.
8. All questions must be based on the document content.
9. Use the specified language for questions.
"#,
        vec![
            QuestionType::SingleChoice,
            QuestionType::MultiChoice,
            QuestionType::TrueFalse,
            QuestionType::FillBlank,
            QuestionType::ShortAnswer,
        ]
        .iter()
        .map(|t| t.to_string())
        .collect::<Vec<_>>()
        .join(", ")
    )
}

pub fn build_user_prompt(text: &str, params: &ExamParams) -> String {
    let difficulty_str = match params.difficulty {
        Difficulty::Easy => "easy questions suitable for beginners",
        Difficulty::Medium => "moderate difficulty questions requiring understanding",
        Difficulty::Hard => "challenging questions requiring deep analysis",
    };

    let topic_note = match &params.topic_filter {
        Some(topic) => format!("\nFocus on this topic: {topic}"),
        None => String::new(),
    };

    let batch_note = match params.batch_index {
        Some(idx) if params.batch_total.unwrap_or(1) > 1 => {
            format!(
                "\nThis is batch {}/{} of the document. Focus on different content than other batches would.",
                idx, params.batch_total.unwrap_or(1)
            )
        }
        _ => String::new(),
    };

    let doc_name = match &params.source_name {
        Some(name) if name.contains('、') => format!("\nThe documents are collectively titled: {name}\nWhen questions need to reference a specific document, use its individual title above — do NOT say \"the document\" or \"the text\".", name = name),
        Some(name) => format!("\nThe document title is: {name}\nWhen questions need to reference this document, use \"{name}\" — do NOT say \"the document\" or \"the text\".", name = name),
        None => String::new(),
    };

    let max_chars = 32000;
    let text_section = if text.len() > max_chars {
        let head_size = max_chars * 6 / 10;
        let tail_size = max_chars - head_size;
        let head_len = safe_char_boundary(text, head_size);
        let head = &text[..head_len];
        let tail_start = safe_char_boundary(text, text.len().saturating_sub(tail_size));
        let tail = if tail_start > head_len + 100 {
            format!("\n\n...(middle omitted)...\n\n{}", &text[tail_start..])
        } else {
            text[head_len..].to_string()
        };
        format!("{}{}", head, tail)
    } else {
        text.to_string()
    };

    let count_instruction = if let Some(ref tc) = params.type_counts {
        let mut parts: Vec<String> = vec![];
        let mut total: u32 = 0;
        for (key, &cnt) in tc {
            if cnt > 0 {
                parts.push(format!("{cnt} {key} questions"));
                total += cnt;
            }
        }
        format!(
            "Generate exactly the following breakdown of {total} questions:\n{per_type}",
            total = total,
            per_type = parts.join("\n")
        )
    } else {
        let types_list = params
            .question_types
            .iter()
            .map(|t| t.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        format!(
            "Generate {count} questions.\nQuestion types: {types}",
            count = params.count,
            types = types_list,
        )
    };

    format!(
        r#"{count_instruction}
Difficulty: {difficulty_str}
Language: {language}{topic_note}{batch_note}{doc_name}

DOCUMENT CONTENT:
{text_content}
"#,
        count_instruction = count_instruction,
        difficulty_str = difficulty_str,
        language = params.language,
        topic_note = topic_note,
        batch_note = batch_note,
        doc_name = doc_name,
        text_content = text_section,
    )
}

pub fn parse_questions(json_str: &str) -> Result<Vec<Question>, CoreError> {
    let cleaned = json_str
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let questions: Vec<Question> = serde_json::from_str(cleaned)
        .map_err(|e| CoreError::Exam(format!("JSON parse error: {e}")))?;

    if questions.is_empty() {
        return Err(CoreError::Exam("AI returned empty questions array".to_string()));
    }

    Ok(questions)
}

pub fn normalize_question_difficulty(questions: &mut [Question], difficulty: &Difficulty) {
    for question in questions {
        question.difficulty = Some(difficulty.clone());
    }
}

fn safe_char_boundary(s: &str, mut index: usize) -> usize {
    if index >= s.len() {
        return s.len();
    }
    while index > 0 && !s.is_char_boundary(index) {
        index -= 1;
    }
    index
}

pub async fn generate_exam(
    client: &AIClient,
    text: &str,
    params: &ExamParams,
    model: &str,
) -> Result<Vec<Question>, CoreError> {
    let doc_text = params.text.as_deref().unwrap_or(text);
    let system_prompt = build_system_prompt();
    let user_prompt = build_user_prompt(doc_text, params);
    let response = client.chat(&system_prompt, &user_prompt, model).await?;
    let mut questions = parse_questions(&response)?;
    normalize_question_difficulty(&mut questions, &params.difficulty);
    Ok(questions)
}
