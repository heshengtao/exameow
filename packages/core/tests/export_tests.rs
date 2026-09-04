use exameow_core::exam::{Question, QuestionType};
use exameow_core::export::export_csv;

fn make_questions() -> Vec<Question> {
    vec![
        Question {
            id: "q1".to_string(),
            qtype: QuestionType::SingleChoice,
            stem: "What is 2+2?".to_string(),
            options: vec!["3".to_string(), "4".to_string(), "5".to_string(), "6".to_string()],
            answer: "4".to_string(),
            analysis: "Basic arithmetic".to_string(),
            ai_analysis: None,
            score: None,
            subject: Some("计算机".to_string()),
            chapter: Some("第一章".to_string()),
            difficulty: None,
        },
        Question {
            id: "q2".to_string(),
            qtype: QuestionType::TrueFalse,
            stem: "The sky is blue.".to_string(),
            options: vec!["True".to_string(), "False".to_string()],
            answer: "True".to_string(),
            analysis: "".to_string(),
            ai_analysis: None,
            score: None,
            subject: None,
            chapter: None,
            difficulty: None,
        },
    ]
}

#[test]
fn test_export_csv() {
    let questions = make_questions();
    let dir = std::env::temp_dir();
    let path = dir.join("test_output.csv");
    let path_str = path.to_str().unwrap();
    export_csv(&questions, path_str).unwrap();

    let content = std::fs::read_to_string(path_str).unwrap();
    assert!(content.contains("题干,题型,选项A,选项B,选项C,选项D,选项E,选项F,选项G,选项H,正确答案,解析,学科,章节,难度"));
    assert!(content.contains("What is 2+2?"));
    assert!(content.contains("单选题"));
    assert!(content.contains("3,4,5,6"));
    assert!(content.contains("The sky is blue."));
    assert!(content.contains("判断题"));
    assert!(content.contains("Basic arithmetic"));

    std::fs::remove_file(&path).ok();
}

#[test]
fn test_export_empty_csv() {
    let questions: Vec<Question> = vec![];
    let dir = std::env::temp_dir();
    let path = dir.join("test_empty.csv");
    let path_str = path.to_str().unwrap();
    export_csv(&questions, path_str).unwrap();

    let content = std::fs::read_to_string(path_str).unwrap();
    let lines: Vec<_> = content.lines().collect();
    assert_eq!(lines.len(), 1);
    assert!(lines[0].contains("题干"));
    assert!(lines[0].contains("正确答案"));

    std::fs::remove_file(&path).ok();
}

#[test]
fn test_export_csv_includes_subject_chapter() {
    let questions = make_questions();
    let dir = std::env::temp_dir();
    let path = dir.join("test_subject_chapter.csv");
    let path_str = path.to_str().unwrap();
    export_csv(&questions, path_str).unwrap();

    let content = std::fs::read_to_string(path_str).unwrap();
    assert!(content.contains("解析,学科,章节,难度"));
    assert!(content.contains("计算机,第一章"));

    std::fs::remove_file(&path).ok();
}
