use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum QuestionType {
    SingleChoice,
    MultiChoice,
    TrueFalse,
    FillBlank,
    ShortAnswer,
}

impl fmt::Display for QuestionType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            QuestionType::SingleChoice => write!(f, "single_choice"),
            QuestionType::MultiChoice => write!(f, "multi_choice"),
            QuestionType::TrueFalse => write!(f, "true_false"),
            QuestionType::FillBlank => write!(f, "fill_blank"),
            QuestionType::ShortAnswer => write!(f, "short_answer"),
        }
    }
}

impl QuestionType {
    pub fn to_label_cn(&self) -> &'static str {
        match self {
            QuestionType::SingleChoice => "单选题",
            QuestionType::MultiChoice => "多选题",
            QuestionType::TrueFalse => "判断题",
            QuestionType::FillBlank => "填空题",
            QuestionType::ShortAnswer => "简答题",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
}

impl fmt::Display for Difficulty {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Difficulty::Easy => write!(f, "easy"),
            Difficulty::Medium => write!(f, "medium"),
            Difficulty::Hard => write!(f, "hard"),
        }
    }
}

fn default_question_type() -> QuestionType {
    QuestionType::ShortAnswer
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Question {
    #[serde(default, deserialize_with = "deserialize_string_lenient")]
    pub id: String,
    #[serde(
        rename = "type",
        default = "default_question_type",
        deserialize_with = "deserialize_question_type"
    )]
    pub qtype: QuestionType,
    #[serde(default, deserialize_with = "deserialize_string_lenient")]
    pub stem: String,
    #[serde(default, deserialize_with = "deserialize_options")]
    pub options: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_string_lenient")]
    pub answer: String,
    #[serde(default, deserialize_with = "deserialize_string_lenient")]
    pub analysis: String,
    #[serde(
        default,
        rename = "aiAnalysis",
        deserialize_with = "deserialize_optional_string",
        skip_serializing_if = "Option::is_none"
    )]
    pub ai_analysis: Option<String>,
    #[serde(
        default,
        deserialize_with = "deserialize_optional_f64",
        skip_serializing_if = "Option::is_none"
    )]
    pub score: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[serde(deserialize_with = "deserialize_chapter")]
    pub chapter: Option<String>,
    #[serde(
        default,
        deserialize_with = "deserialize_optional_difficulty",
        skip_serializing_if = "Option::is_none"
    )]
    pub difficulty: Option<Difficulty>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media: Option<Vec<QuestionMedia>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionMedia {
    #[serde(default)]
    pub id: String,
    /// "stem" or "option"
    #[serde(default = "default_media_target")]
    pub target: String,
    #[serde(default, rename = "optionIndex", skip_serializing_if = "Option::is_none")]
    pub option_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamParams {
    pub question_types: Vec<QuestionType>,
    pub count: u32,
    pub difficulty: Difficulty,
    pub language: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic_filter: Option<String>,
    #[serde(default)]
    pub auto_chapter: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chapter_names: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub type_counts: Option<std::collections::HashMap<String, u32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub batch_index: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub batch_total: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
}

fn default_media_target() -> String {
    "stem".to_string()
}

fn value_to_string(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(text) => text.clone(),
        serde_json::Value::Null => String::new(),
        serde_json::Value::Bool(flag) => flag.to_string(),
        serde_json::Value::Number(number) => number.to_string(),
        other => other.to_string(),
    }
}

fn deserialize_string_lenient<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<String, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(value_to_string(&value))
}

fn deserialize_optional_string<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(|value| {
        let text = value_to_string(&value).trim().to_string();
        if text.is_empty() { None } else { Some(text) }
    }))
}

fn deserialize_chapter<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(|value| {
        value
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_owned)
    }))
}

fn deserialize_optional_f64<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<f64>, D::Error> {
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(|value| match value {
        serde_json::Value::Number(number) => number.as_f64(),
        serde_json::Value::String(text) => text.trim().parse::<f64>().ok(),
        _ => None,
    }))
}

fn deserialize_options<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<String>, D::Error> {
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(match value {
        Some(serde_json::Value::Array(items)) => items
            .iter()
            .map(value_to_string)
            .map(|text| text.trim().to_string())
            .collect(),
        Some(serde_json::Value::String(text)) => text
            .split(|ch| ch == '\n' || ch == ';' || ch == '|')
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .map(str::to_owned)
            .collect(),
        _ => Vec::new(),
    })
}

fn deserialize_question_type<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<QuestionType, D::Error> {
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    let Some(serde_json::Value::String(text)) = value else {
        return Ok(QuestionType::ShortAnswer);
    };
    let text = text.trim().to_lowercase();
    Ok(if text.contains("multi") || text.contains("多选") || text.contains("多選")
        || text.contains("複数") || text.contains("복수")
    {
        QuestionType::MultiChoice
    } else if text.contains("true") || text.contains("false") || text.contains("判断")
        || text.contains("判斷")
    {
        QuestionType::TrueFalse
    } else if text.contains("fill") || text.contains("blank") || text.contains("填空") {
        QuestionType::FillBlank
    } else if text.contains("single") || text.contains("单选") || text.contains("單選")
        || text.contains("選択") || text.contains("단일")
    {
        QuestionType::SingleChoice
    } else {
        QuestionType::ShortAnswer
    })
}

fn deserialize_optional_difficulty<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Difficulty>, D::Error> {
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    let Some(value) = value else { return Ok(None) };
    let text = value_to_string(&value).trim().to_lowercase();
    Ok(match text.as_str() {
        "easy" | "简单" | "簡單" | "易" | "簡単" | "쉬움" | "fácil" | "facile" | "leicht"
        | "легко" | "سهل" => Some(Difficulty::Easy),
        "medium" | "中等" | "适中" | "適中" | "中" | "普通" | "보통" | "medio" | "moyen"
        | "mittel" | "средне" | "متوسط" => Some(Difficulty::Medium),
        "hard" | "困难" | "困難" | "难" | "難" | "難しい" | "어려움" | "difícil" | "difficile"
        | "schwer" | "сложно" | "صعب" => Some(Difficulty::Hard),
        _ => None,
    })
}

#[cfg(test)]
mod compat_tests {
    use super::*;

    #[test]
    fn deserializes_minimal_legacy_question() {
        let question: Question = serde_json::from_str(r#"{"stem":"Q"}"#).unwrap();
        assert_eq!(question.stem, "Q");
        assert_eq!(question.qtype, QuestionType::ShortAnswer);
        assert!(question.options.is_empty());
        assert_eq!(question.answer, "");
        assert_eq!(question.analysis, "");
        assert!(question.media.is_none());
    }

    #[test]
    fn accepts_legacy_labels_and_scalar_types() {
        let question: Question = serde_json::from_str(
            r#"{"type":"单选题","subject":"Math","chapter":"Ch3","difficulty":"简单","score":"2.5","options":"A\nB"}"#,
        )
        .unwrap();
        assert_eq!(question.qtype, QuestionType::SingleChoice);
        assert_eq!(question.subject.as_deref(), Some("Math"));
        assert_eq!(question.chapter.as_deref(), Some("Ch3"));
        assert_eq!(question.difficulty, Some(Difficulty::Easy));
        assert_eq!(question.score, Some(2.5));
        assert_eq!(question.options, vec!["A", "B"]);
    }

    #[test]
    fn media_defaults_to_stem() {
        let question: Question = serde_json::from_str(r#"{"media":[{"id":"img1"}]}"#).unwrap();
        let media = question.media.unwrap();
        assert_eq!(media[0].id, "img1");
        assert_eq!(media[0].target, "stem");
    }
}
