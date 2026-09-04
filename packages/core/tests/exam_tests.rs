use exameow_core::exam::*;
use exameow_core::ai::AIClient;

fn mock_ai_response() -> &'static str {
    r#"{"choices":[{"message":{"content":"[\n        {\"id\":\"q1\",\"type\":\"single_choice\",\"stem\":\"One?\",\"options\":[\"A\",\"B\"],\"answer\":\"A\",\"analysis\":\"\"},\n        {\"id\":\"q2\",\"type\":\"true_false\",\"stem\":\"Two?\",\"options\":[\"True\",\"False\"],\"answer\":\"True\",\"analysis\":\"\",\"difficulty\":\"easy\"}\n    ]"}}]}"#
}

async fn start_mock_ai_server() -> String {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0_u8; 4096];
        let _ = stream.read(&mut request);
        let body = mock_ai_response();
        write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
    });
    format!("http://{}", address)
}

#[test]
fn test_build_system_prompt() {
    let prompt = build_system_prompt();
    assert!(prompt.contains("expert exam question generator"));
    assert!(prompt.contains("single_choice"));
}

#[test]
fn test_build_user_prompt() {
    let params = ExamParams {
        question_types: vec![QuestionType::SingleChoice, QuestionType::TrueFalse],
        count: 5,
        difficulty: Difficulty::Medium,
        language: "zh-CN".to_string(),
        topic_filter: Some("Machine Learning".to_string()),
        type_counts: None,
        text: None,
        batch_index: None,
        batch_total: None,
        source_name: None,
    };
    let text = "Sample document content about ML.";
    let prompt = build_user_prompt(text, &params);
    assert!(prompt.contains("5 questions"));
    assert!(prompt.contains("single_choice"));
    assert!(prompt.contains("true_false"));
    assert!(prompt.contains("zh-CN"));
    assert!(prompt.contains("Machine Learning"));
    assert!(prompt.contains("Sample document content"));
}

#[test]
fn test_build_user_prompt_with_counts() {
    let mut type_counts = std::collections::HashMap::new();
    type_counts.insert("single_choice".to_string(), 3);
    type_counts.insert("true_false".to_string(), 2);
    let params = ExamParams {
        question_types: vec![QuestionType::SingleChoice, QuestionType::TrueFalse],
        count: 5,
        difficulty: Difficulty::Easy,
        language: "en-US".to_string(),
        topic_filter: None,
        type_counts: Some(type_counts),
        text: None,
        batch_index: None,
        batch_total: None,
        source_name: None,
    };
    let text = "Test content.";
    let prompt = build_user_prompt(text, &params);
    assert!(prompt.contains("5 questions"));
    assert!(prompt.contains("3 single_choice"));
    assert!(prompt.contains("2 true_false"));
    assert!(prompt.contains("Test content"));
}

#[test]
fn test_parse_questions_valid_json() {
    let json = r#"[
        {"id": "q1", "type": "single_choice", "stem": "What is AI?", "options": ["A", "B", "C", "D"], "answer": "A", "analysis": "AI is..."},
        {"id": "q2", "type": "true_false", "stem": "Is Earth round?", "options": ["True", "False"], "answer": "True", "analysis": ""}
    ]"#;
    let questions = parse_questions(json).unwrap();
    assert_eq!(questions.len(), 2);
    assert_eq!(questions[0].id, "q1");
    assert_eq!(questions[0].qtype, QuestionType::SingleChoice);
}

#[test]
fn test_parse_questions_empty_array() {
    let json = "[]";
    let result = parse_questions(json);
    assert!(result.is_err());
}

#[test]
fn test_parse_questions_with_markdown_fences() {
    let json = "```json\n[{\"id\":\"q1\",\"type\":\"true_false\",\"stem\":\"Test?\",\"options\":[\"True\",\"False\"],\"answer\":\"True\",\"analysis\":\"\"}]\n```";
    let questions = parse_questions(json).unwrap();
    assert_eq!(questions.len(), 1);
}

#[test]
fn test_question_type_labels() {
    assert_eq!(QuestionType::SingleChoice.to_label_cn(), "单选题");
    assert_eq!(QuestionType::TrueFalse.to_label_cn(), "判断题");
    assert_eq!(QuestionType::FillBlank.to_label_cn(), "填空题");
}

#[test]
fn test_parse_questions_with_subject_chapter() {
    let json = r#"[
        {"id": "q1", "type": "single_choice", "stem": "What is AI?", "options": ["A", "B", "C", "D"], "answer": "A", "analysis": "", "subject": "计算机", "chapter": "第一章 绪论"},
        {"id": "q2", "type": "true_false", "stem": "Is Earth round?", "options": ["True", "False"], "answer": "True", "analysis": "", "subject": "地理", "chapter": "第二章 大气"}
    ]"#;
    let questions = parse_questions(json).unwrap();
    assert_eq!(questions[0].subject.as_deref(), Some("计算机"));
    assert_eq!(questions[0].chapter.as_deref(), Some("第一章 绪论"));
    assert_eq!(questions[1].subject.as_deref(), Some("地理"));
    assert_eq!(questions[1].chapter.as_deref(), Some("第二章 大气"));

    let serialized = serde_json::to_string(&questions[0]).unwrap();
    assert!(serialized.contains("\"subject\":\"计算机\""));
    assert!(serialized.contains("\"chapter\":\"第一章 绪论\""));
}

#[test]
fn test_parse_questions_without_subject_chapter() {
    let json = r#"[
        {"id": "q1", "type": "single_choice", "stem": "What is AI?", "options": ["A", "B", "C", "D"], "answer": "A", "analysis": ""}
    ]"#;
    let questions = parse_questions(json).unwrap();
    assert_eq!(questions[0].subject, None);
    assert_eq!(questions[0].chapter, None);
    let serialized = serde_json::to_string(&questions[0]).unwrap();
    assert!(!serialized.contains("\"subject\""));
    assert!(!serialized.contains("\"chapter\""));
}

#[test]
fn test_normalize_questions_to_requested_difficulty() {
    let json = r#"[
        {"id":"q1","type":"single_choice","stem":"One?","options":["A"],"answer":"A","analysis":""},
        {"id":"q2","type":"true_false","stem":"Two?","options":["True","False"],"answer":"True","analysis":"","difficulty":"easy"}
    ]"#;
    let mut questions = parse_questions(json).unwrap();

    normalize_question_difficulty(&mut questions, &Difficulty::Hard);

    assert!(questions.iter().all(|question| question.difficulty == Some(Difficulty::Hard)));
}

#[tokio::test]
async fn test_generate_exam_response_path_normalizes_every_question_difficulty() {
    let endpoint = start_mock_ai_server().await;
    let client = AIClient::new(&endpoint, "test-key");
    let params = ExamParams {
        question_types: vec![QuestionType::SingleChoice, QuestionType::TrueFalse],
        count: 2,
        difficulty: Difficulty::Hard,
        language: "en-US".to_string(),
        topic_filter: None,
        type_counts: None,
        text: None,
        batch_index: None,
        batch_total: None,
        source_name: None,
    };

    let questions = generate_exam(&client, "Boundary test content", &params, "mock-model")
        .await
        .unwrap();

    assert_eq!(questions.len(), 2);
    assert!(questions
        .iter()
        .all(|question| question.difficulty == Some(Difficulty::Hard)));
}

#[test]
fn test_question_difficulty_round_trip_and_omission() {
    let hard_json = r#"{
        "id": "q1",
        "type": "single_choice",
        "stem": "What is AI?",
        "options": ["A", "B"],
        "answer": "A",
        "analysis": "",
        "difficulty": "hard"
    }"#;
    let hard_question: Question = serde_json::from_str(hard_json).unwrap();
    assert_eq!(hard_question.difficulty, Some(Difficulty::Hard));

    let hard_serialized = serde_json::to_string(&hard_question).unwrap();
    assert!(hard_serialized.contains("\"difficulty\":\"hard\""));
    let hard_round_tripped: Question = serde_json::from_str(&hard_serialized).unwrap();
    assert_eq!(hard_round_tripped.difficulty, Some(Difficulty::Hard));

    let default_json = r#"{
        "id": "q2",
        "type": "true_false",
        "stem": "Is Earth round?",
        "options": ["True", "False"],
        "answer": "True",
        "analysis": ""
    }"#;
    let default_question: Question = serde_json::from_str(default_json).unwrap();
    assert_eq!(default_question.difficulty, None);

    let default_serialized = serde_json::to_string(&default_question).unwrap();
    assert!(!default_serialized.contains("\"difficulty\""));
}
