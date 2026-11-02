use crate::error::CoreError;
use crate::exam::Question;
use csv::WriterBuilder;
use std::io::Write;

use super::labels::{difficulty_index, difficulty_label, labels_for, type_index, type_label};

pub fn export_csv(questions: &[Question], path: &str, locale: &str) -> Result<(), CoreError> {
    let mut wtr = WriterBuilder::new()
        .from_path(path)
        .map_err(|e| CoreError::Export(format!("cannot create CSV file: {e}")))?;

    write_csv_records(questions, &mut wtr, locale)?;

    Ok(())
}

pub fn export_csv_to_writer<W: Write>(
    questions: &[Question],
    writer: W,
    locale: &str,
) -> Result<(), CoreError> {
    let mut wtr = WriterBuilder::new()
        .from_writer(writer);

    write_csv_records(questions, &mut wtr, locale)?;

    Ok(())
}

fn write_csv_records<W: Write>(
    questions: &[Question],
    wtr: &mut csv::Writer<W>,
    locale: &str,
) -> Result<(), CoreError> {
    let labels = labels_for(locale);

    wtr.write_record(labels.header_row())
        .map_err(|e| CoreError::Export(format!("write error: {e}")))?;

    for q in questions {
        let qtype_str = q.qtype.to_string();
        let qtype = type_label(&labels, type_index(&qtype_str));
        let difficulty = q
            .difficulty
            .as_ref()
            .map(|d| difficulty_label(&labels, difficulty_index(&d.to_string())))
            .unwrap_or_default();

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
        row.push(difficulty.to_string());

        wtr.write_record(&row)
            .map_err(|e| CoreError::Export(format!("write error: {e}")))?;
    }

    wtr.flush()
        .map_err(|e| CoreError::Export(format!("flush error: {e}")))?;

    Ok(())
}
