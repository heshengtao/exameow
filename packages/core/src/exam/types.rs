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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Question {
    pub id: String,
    #[serde(rename = "type")]
    pub qtype: QuestionType,
    pub stem: String,
    #[serde(default)]
    pub options: Vec<String>,
    pub answer: String,
    #[serde(default)]
    pub analysis: String,
    #[serde(default, rename = "aiAnalysis", skip_serializing_if = "Option::is_none")]
    pub ai_analysis: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chapter: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamParams {
    pub question_types: Vec<QuestionType>,
    pub count: u32,
    pub difficulty: Difficulty,
    pub language: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic_filter: Option<String>,
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
}
