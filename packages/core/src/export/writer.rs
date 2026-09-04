use crate::error::CoreError;
use crate::exam::Question;
use csv::WriterBuilder;
use std::io::Write;

use super::xlsx::to_chinese_type;

pub fn export_csv(questions: &[Question], path: &str) -> Result<(), CoreError> {
    let mut wtr = WriterBuilder::new()
        .from_path(path)
        .map_err(|e| CoreError::Export(format!("cannot create CSV file: {e}")))?;

    write_csv_records(questions, &mut wtr)?;

    Ok(())
}

pub fn export_csv_to_writer<W: Write>(questions: &[Question], writer: W) -> Result<(), CoreError> {
    let mut wtr = WriterBuilder::new()
        .from_writer(writer);

    write_csv_records(questions, &mut wtr)?;

    Ok(())
}

fn write_csv_records<W: Write>(questions: &[Question], wtr: &mut csv::Writer<W>) -> Result<(), CoreError> {
    wtr.write_record(["题干", "题型", "选项A", "选项B", "选项C", "选项D", "选项E", "选项F", "选项G", "选项H", "正确答案", "解析", "学科", "章节", "难度"])
        .map_err(|e| CoreError::Export(format!("write error: {e}")))?;

    for q in questions {
        let qtype_str = q.qtype.to_string();
        let qtype = to_chinese_type(&qtype_str);
        let mut row: Vec<String> = vec![
            q.stem.clone(),
            qtype.to_string(),
        ];
        for i in 0..8 {
            row.push(q.options.get(i).cloned().unwrap_or_default());
        }
        row.push(q.answer.clone());
        row.push(q.analysis.clone());
        row.push(q.subject.clone().unwrap_or_default());
        row.push(q.chapter.clone().unwrap_or_default());
        row.push(q.difficulty.as_ref().map(ToString::to_string).unwrap_or_default());

        wtr.write_record(&row)
            .map_err(|e| CoreError::Export(format!("write error: {e}")))?;
    }

    wtr.flush()
        .map_err(|e| CoreError::Export(format!("flush error: {e}")))?;

    Ok(())
}
