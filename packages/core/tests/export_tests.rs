use exameow_core::exam::{Difficulty, Question, QuestionType};
use exameow_core::export::{export_csv, export_xlsx_to_writer};

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
            difficulty: Some(Difficulty::Hard),
            media: None,
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
            media: None,
        },
    ]
}

#[test]
fn test_export_csv() {
    let questions = make_questions();
    let dir = std::env::temp_dir();
    let path = dir.join("test_output.csv");
    let path_str = path.to_str().unwrap();
    export_csv(&questions, path_str, "zh").unwrap();

    let content = std::fs::read_to_string(path_str).unwrap();
    assert!(content.contains("题干,题型,选项A,选项B,选项C,选项D,选项E,选项F,选项G,选项H,正确答案,解析,学科,章节,难度"));
    assert!(content.contains("What is 2+2?"));
    assert!(content.contains("单选题"));
    assert!(content.contains("3,4,5,6"));
    assert!(content.contains("The sky is blue."));
    assert!(content.contains("判断题"));
    assert!(content.contains("Basic arithmetic"));
    assert!(content.contains("计算机,第一章,困难"));

    std::fs::remove_file(&path).ok();
}

#[test]
fn test_export_empty_csv() {
    let questions: Vec<Question> = vec![];
    let dir = std::env::temp_dir();
    let path = dir.join("test_empty.csv");
    let path_str = path.to_str().unwrap();
    export_csv(&questions, path_str, "zh").unwrap();

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
    export_csv(&questions, path_str, "zh").unwrap();

    let content = std::fs::read_to_string(path_str).unwrap();
    assert!(content.contains("解析,学科,章节,难度"));
    assert!(content.contains("计算机,第一章"));

    std::fs::remove_file(&path).ok();
}

#[test]
fn test_export_xlsx_includes_difficulty_value_in_final_column() {
    let data = export_xlsx_to_writer(&make_questions(), "zh").unwrap();
    let reader = std::io::Cursor::new(data);
    let mut archive = zip::ZipArchive::new(reader).unwrap();
    let mut sheet = String::new();
    use std::io::Read;
    archive
        .by_name("xl/worksheets/sheet1.xml")
        .unwrap()
        .read_to_string(&mut sheet)
        .unwrap();

    assert!(sheet.contains("r=\"O1\""));
    assert!(sheet.contains("r=\"O2\""));

    let mut shared = String::new();
    archive
        .by_name("xl/sharedStrings.xml")
        .unwrap()
        .read_to_string(&mut shared)
        .unwrap();
    assert!(shared.contains("><t>难度</t>"));
    assert!(shared.contains("><t>困难</t>"));
}

#[test]
fn test_export_csv_localized_headers_and_labels() {
    let questions = make_questions();

    // 法语:表头与题型/难度都应本地化
    let mut buf = Vec::new();
    exameow_core::export::export_csv_to_writer(&questions, &mut buf, "fr").unwrap();
    let fr = String::from_utf8(buf).unwrap();
    assert!(fr.starts_with("Énoncé,Type,Option A"), "fr 表头异常: {}", &fr[..80]);
    assert!(fr.contains("Choix unique"), "fr 题型未本地化");
    assert!(fr.contains("Difficile"), "fr 难度未本地化");

    // 俄语
    let mut buf = Vec::new();
    exameow_core::export::export_csv_to_writer(&questions, &mut buf, "ru").unwrap();
    let ru = String::from_utf8(buf).unwrap();
    assert!(ru.starts_with("Вопрос,Тип,Вариант A"), "ru 表头异常: {}", &ru[..80]);
    assert!(ru.contains("Одиночный выбор"), "ru 题型未本地化");

    // 未知语言回落到中文(保持历史行为)
    let mut buf = Vec::new();
    exameow_core::export::export_csv_to_writer(&questions, &mut buf, "xx-YY").unwrap();
    let fallback = String::from_utf8(buf).unwrap();
    assert!(fallback.starts_with("题干,题型,选项A"), "回落行为异常");
}

#[test]
fn test_export_xlsx_uses_localized_headers() {
    let data = export_xlsx_to_writer(&make_questions(), "de").unwrap();
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(data)).unwrap();
    let mut shared = String::new();
    use std::io::Read;
    archive
        .by_name("xl/sharedStrings.xml")
        .unwrap()
        .read_to_string(&mut shared)
        .unwrap();

    assert!(shared.contains("><t>Frage (erforderlich)</t>"), "de XLSX 缺少本地化表头");
    assert!(shared.contains("><t>Einzelauswahl</t>"), "de XLSX 题型未本地化");
    assert!(shared.contains("><t>Schwer</t>"), "de XLSX 难度未本地化");
}
