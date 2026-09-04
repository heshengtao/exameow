use crate::error::CoreError;
use crate::exam::Question;
use std::io::{Cursor, Write};
use zip::write::FileOptions;
use zip::CompressionMethod;

const XLSX_TYPE_MAP: &[(&str, &str)] = &[
    ("single_choice", "单选题"),
    ("multi_choice", "多选题"),
    ("true_false", "判断题"),
    ("fill_blank", "填空题"),
    ("short_answer", "简答题"),
];

pub(super) fn to_chinese_type(qtype: &str) -> &str {
    for (key, label) in XLSX_TYPE_MAP {
        if qtype == *key {
            return label;
        }
    }
    "简答题"
}

struct SharedStringWriter {
    strings: Vec<String>,
    index_map: std::collections::HashMap<String, usize>,
}

impl SharedStringWriter {
    fn new() -> Self {
        SharedStringWriter {
            strings: Vec::new(),
            index_map: std::collections::HashMap::new(),
        }
    }

    fn add(&mut self, s: &str) -> usize {
        if let Some(idx) = self.index_map.get(s) {
            return *idx;
        }
        let idx = self.strings.len();
        self.strings.push(s.to_string());
        self.index_map.insert(s.to_string(), idx);
        idx
    }

    fn to_xml(&self) -> String {
        let count = self.strings.len();
        let mut xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{}" uniqueCount="{}">"#,
            count, count
        );
        for s in &self.strings {
            let escaped = escape_xml(s);
            xml.push_str(&format!("<si><t>{}</t></si>", escaped));
        }
        xml.push_str("</sst>");
        xml
    }
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn col_letter(idx: usize) -> String {
    let mut n = idx;
    let mut result = Vec::new();
    loop {
        let rem = n % 26;
        result.push((b'A' + rem as u8) as char);
        if n < 26 {
            break;
        }
        n = n / 26 - 1;
    }
    result.reverse();
    result.into_iter().collect()
}

fn answer_letter(answer: &str, options: &[String]) -> String {
    if answer.len() == 1 && answer.chars().all(|c| c.is_ascii_uppercase() && c >= 'A' && c <= 'H') {
        return answer.to_string();
    }

    let mut letters = String::new();
    for ch in answer.chars() {
        if ch.is_ascii_uppercase() && ch >= 'A' && ch <= 'H' {
            letters.push(ch);
        }
    }
    if !letters.is_empty() {
        return letters;
    }

    let mut result = String::new();
    for a_part in answer.split(',') {
        let a_part = a_part.trim();
        if let Some(pos) = options.iter().position(|o| o.trim() == a_part) {
            result.push((b'A' + pos as u8) as char);
        }
    }

    if result.is_empty() {
        answer.to_string()
    } else {
        result
    }
}

fn true_false_answer(answer: &str) -> &str {
    match answer.trim() {
        "对" | "正确" | "√" | "是" | "true" | "True" | "TRUE" => "√",
        "错" | "错误" | "×" | "否" | "false" | "False" | "FALSE" => "×",
        _ => answer,
    }
}

impl Default for SharedStringWriter {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Default)]
struct SheetDataWriter {
    rows: Vec<String>,
    current_row: usize,
    shared_strings: SharedStringWriter,
}

impl SheetDataWriter {
    fn new_row(&mut self) {
        self.current_row = self.rows.len();
        let row_num = self.current_row + 1;
        self.rows.push(format!(r#"<row r="{}" spans="1:15">"#, row_num));
    }

    fn finish_row(&mut self) {
        if let Some(last) = self.rows.last_mut() {
            last.push_str("</row>");
        }
    }

    fn add_string_cell(&mut self, col: usize, value: &str) {
        let si = self.shared_strings.add(value);
        let row_num = self.current_row + 1;
        let col_letter = col_letter(col);
        let cell = format!(
            r#"<c r="{}{}" t="s"><v>{}</v></c>"#,
            col_letter, row_num, si
        );
        if let Some(last) = self.rows.last_mut() {
            last.push_str(&cell);
        }
    }

    fn to_xml(&self) -> String {
        let mut xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>"#
            .to_string();

        for row in &self.rows {
            xml.push_str(row);
        }

        xml.push_str("</sheetData></worksheet>");
        xml
    }
}

pub fn export_xlsx(questions: &[Question], path: &str) -> Result<(), CoreError> {
    let data = generate_xlsx(questions)?;
    std::fs::write(path, data)
        .map_err(|e| CoreError::Export(format!("cannot write file: {e}")))
}

pub fn export_xlsx_to_writer(questions: &[Question]) -> Result<Vec<u8>, CoreError> {
    generate_xlsx(questions)
}

fn generate_xlsx(questions: &[Question]) -> Result<Vec<u8>, CoreError> {
    let mut writer = SheetDataWriter::default();

    // Row 1: Header
    writer.new_row();
    writer.add_string_cell(0, "题干（必填）");
    writer.add_string_cell(1, "题型 （必填）");
    for i in 0..8 {
        writer.add_string_cell(2 + i, &format!("选项 {}", (b'A' + i as u8) as char));
    }
    writer.add_string_cell(10, "正确答案\n（必填）");
    writer.add_string_cell(11, "解析\n（勿删）");
    writer.add_string_cell(12, "学科");
    writer.add_string_cell(13, "章节\n（勿删）");
    writer.add_string_cell(14, "难度");
    writer.finish_row();

    for q in questions {
        writer.new_row();

        let stem = q.stem.trim();
        let qtype_str = q.qtype.to_string();
        let qtype = to_chinese_type(&qtype_str);
        let analysis = q.analysis.trim();
        let answer = q.answer.trim();
        let options: Vec<String> = q.options.iter().map(|o| o.trim().to_string()).collect();

        let k_answer = match &q.qtype {
            crate::exam::QuestionType::SingleChoice | crate::exam::QuestionType::MultiChoice => {
                answer_letter(answer, &options)
            }
            crate::exam::QuestionType::TrueFalse => true_false_answer(answer).to_string(),
            crate::exam::QuestionType::FillBlank | crate::exam::QuestionType::ShortAnswer => {
                answer.to_string()
            }
        };

        writer.add_string_cell(0, stem);
        writer.add_string_cell(1, qtype);
        for (i, opt) in options.iter().enumerate() {
            if i < 8 {
                writer.add_string_cell(2 + i, opt);
            }
        }

        if let crate::exam::QuestionType::FillBlank = &q.qtype {
            if answer.contains('|') {
                let parts: Vec<&str> = answer.split('|').map(|s| s.trim()).collect();
                for (i, part) in parts.iter().enumerate() {
                    if i < 8 && !part.is_empty() {
                        writer.add_string_cell(2 + i, part);
                    }
                }
            }
        }

        writer.add_string_cell(10, &k_answer);
        writer.add_string_cell(11, if analysis.is_empty() { "" } else { analysis });
        writer.add_string_cell(12, q.subject.clone().unwrap_or_default().as_str());
        writer.add_string_cell(13, q.chapter.clone().unwrap_or_default().as_str());
        writer.add_string_cell(14, &q.difficulty.as_ref().map(ToString::to_string).unwrap_or_default());

        writer.finish_row();
    }

    let sheet_xml = writer.to_xml();
    let sst_xml = writer.shared_strings.to_xml();

    let styles_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1">
    <font><sz val="11"/><name val="Heiti SC Light"/></font>
  </fonts>
  <fills count="1">
    <fill><patternFill patternType="none"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
</styleSheet>"#;

    let content_types = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>"#;

    let root_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#;

    let workbook_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>"#;

    let workbook_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"#;

    let buf = Cursor::new(Vec::new());
    let mut zip_writer = zip::ZipWriter::new(buf);
    let opts = FileOptions::<()>::default().compression_method(CompressionMethod::Deflated);

    zip_writer
        .start_file("[Content_Types].xml", opts)
        .map_err(|e| CoreError::Export(format!("zip error: {e}")))?;
    zip_writer
        .write_all(content_types.as_bytes())
        .map_err(|e| CoreError::Export(format!("zip write error: {e}")))?;

    zip_writer
        .start_file("_rels/.rels", opts)
        .map_err(|e| CoreError::Export(format!("zip error: {e}")))?;
    zip_writer
        .write_all(root_rels.as_bytes())
        .map_err(|e| CoreError::Export(format!("zip write error: {e}")))?;

    zip_writer
        .start_file("xl/workbook.xml", opts)
        .map_err(|e| CoreError::Export(format!("zip error: {e}")))?;
    zip_writer
        .write_all(workbook_xml.as_bytes())
        .map_err(|e| CoreError::Export(format!("zip write error: {e}")))?;

    zip_writer
        .start_file("xl/_rels/workbook.xml.rels", opts)
        .map_err(|e| CoreError::Export(format!("zip error: {e}")))?;
    zip_writer
        .write_all(workbook_rels.as_bytes())
        .map_err(|e| CoreError::Export(format!("zip write error: {e}")))?;

    zip_writer
        .start_file("xl/worksheets/sheet1.xml", opts)
        .map_err(|e| CoreError::Export(format!("zip error: {e}")))?;
    zip_writer
        .write_all(sheet_xml.as_bytes())
        .map_err(|e| CoreError::Export(format!("zip write error: {e}")))?;

    zip_writer
        .start_file("xl/sharedStrings.xml", opts)
        .map_err(|e| CoreError::Export(format!("zip error: {e}")))?;
    zip_writer
        .write_all(sst_xml.as_bytes())
        .map_err(|e| CoreError::Export(format!("zip write error: {e}")))?;

    zip_writer
        .start_file("xl/styles.xml", opts)
        .map_err(|e| CoreError::Export(format!("zip error: {e}")))?;
    zip_writer
        .write_all(styles_xml.as_bytes())
        .map_err(|e| CoreError::Export(format!("zip write error: {e}")))?;

    let result = zip_writer
        .finish()
        .map_err(|e| CoreError::Export(format!("zip finalize error: {e}")))?;
    Ok(result.into_inner())
}
