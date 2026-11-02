//! 导出用词表(与前端 `utils/exportLabels.ts`、Workers `exportLabels.ts` 保持一字不差)。
//!
//! 表头必须与「下载题库模板」的表头一致,否则导出的文件导入端认不出来。

/// 题型下标:与 `TYPES` 数组顺序对应。
pub const TYPE_SINGLE: usize = 0;
pub const TYPE_MULTI: usize = 1;
pub const TYPE_TRUE_FALSE: usize = 2;
pub const TYPE_FILL_BLANK: usize = 3;
pub const TYPE_SHORT_ANSWER: usize = 4;

/// 难度下标:与 `DIFFICULTIES` 数组顺序对应。
pub const DIFF_EASY: usize = 0;
pub const DIFF_MEDIUM: usize = 1;
pub const DIFF_HARD: usize = 2;

pub struct ExportLabels {
    pub stem: &'static str,
    pub qtype: &'static str,
    /// 选项列前缀,拼上 A–H 得到列名
    pub option_prefix: &'static str,
    pub answer: &'static str,
    pub analysis: &'static str,
    pub subject: &'static str,
    pub chapter: &'static str,
    pub difficulty: &'static str,
    /// XLSX 表头后缀提示
    pub required: &'static str,
    pub keep: &'static str,
    /// 顺序:single_choice, multi_choice, true_false, fill_blank, short_answer
    pub types: [&'static str; 5],
    /// 顺序:easy, medium, hard
    pub difficulties: [&'static str; 3],
}

impl ExportLabels {
    /// CSV / 模板用的纯表头
    pub fn header_row(&self) -> Vec<String> {
        let mut row = vec![self.stem.to_string(), self.qtype.to_string()];
        for i in 0..8u8 {
            row.push(format!("{}{}", self.option_prefix, (b'A' + i) as char));
        }
        row.push(self.answer.to_string());
        row.push(self.analysis.to_string());
        row.push(self.subject.to_string());
        row.push(self.chapter.to_string());
        row.push(self.difficulty.to_string());
        row
    }

    /// XLSX 表头(带必填/勿删提示)
    pub fn xlsx_header_row(&self) -> Vec<String> {
        let mut row = vec![
            format!("{}{}", self.stem, self.required),
            format!("{}{}", self.qtype, self.required),
        ];
        for i in 0..8u8 {
            row.push(format!("{}{}", self.option_prefix, (b'A' + i) as char));
        }
        row.push(format!("{}\n{}", self.answer, self.required));
        row.push(format!("{}\n{}", self.analysis, self.keep));
        row.push(self.subject.to_string());
        row.push(format!("{}\n{}", self.chapter, self.keep));
        row.push(self.difficulty.to_string());
        row
    }
}

/// 取某语言的导出词表;未知语言回落到中文(与历史行为一致)。
pub fn labels_for(locale: &str) -> ExportLabels {
    match locale {
        "zh" => ExportLabels {
            stem: "题干",
            qtype: "题型",
            option_prefix: "选项",
            answer: "正确答案",
            analysis: "解析",
            subject: "学科",
            chapter: "章节",
            difficulty: "难度",
            required: "（必填）",
            keep: "（勿删）",
            types: ["单选题", "多选题", "判断题", "填空题", "简答题"],
            difficulties: ["简单", "中等", "困难"],
        },
        "zh-TW" => ExportLabels {
            stem: "題幹",
            qtype: "題型",
            option_prefix: "選項",
            answer: "正確答案",
            analysis: "解析",
            subject: "學科",
            chapter: "章節",
            difficulty: "難度",
            required: "（必填）",
            keep: "（勿刪）",
            types: ["單選題", "多選題", "判斷題", "填空題", "簡答題"],
            difficulties: ["簡單", "中等", "困難"],
        },
        "en" => ExportLabels {
            stem: "Question",
            qtype: "Type",
            option_prefix: "Option ",
            answer: "Answer",
            analysis: "Analysis",
            subject: "Subject",
            chapter: "Chapter",
            difficulty: "Difficulty",
            required: " (required)",
            keep: " (keep)",
            types: ["Single Choice", "Multiple Choice", "True or False", "Fill in the Blank", "Short Answer"],
            difficulties: ["Easy", "Medium", "Hard"],
        },
        "ja" => ExportLabels {
            stem: "問題文",
            qtype: "問題形式",
            option_prefix: "選択肢",
            answer: "正解",
            analysis: "解説",
            subject: "科目",
            chapter: "章",
            difficulty: "難易度",
            required: "（必須）",
            keep: "（削除不可）",
            types: ["単一選択", "複数選択", "正誤問題", "穴埋め", "記述問題"],
            difficulties: ["簡単", "普通", "難しい"],
        },
        "ko" => ExportLabels {
            stem: "문제",
            qtype: "유형",
            option_prefix: "보기 ",
            answer: "정답",
            analysis: "해설",
            subject: "과목",
            chapter: "단원",
            difficulty: "난이도",
            required: " (필수)",
            keep: " (삭제 금지)",
            types: ["단일 선택", "복수 선택", "참·거짓", "빈칸 채우기", "서술형"],
            difficulties: ["쉬움", "보통", "어려움"],
        },
        "es" => ExportLabels {
            stem: "Enunciado",
            qtype: "Tipo",
            option_prefix: "Opción ",
            answer: "Respuesta",
            analysis: "Análisis",
            subject: "Materia",
            chapter: "Capítulo",
            difficulty: "Dificultad",
            required: " (obligatorio)",
            keep: " (no borrar)",
            types: ["Opción única", "Opción múltiple", "Verdadero o falso", "Completar el espacio", "Respuesta corta"],
            difficulties: ["Fácil", "Medio", "Difícil"],
        },
        "fr" => ExportLabels {
            stem: "Énoncé",
            qtype: "Type",
            option_prefix: "Option ",
            answer: "Réponse",
            analysis: "Analyse",
            subject: "Matière",
            chapter: "Chapitre",
            difficulty: "Difficulté",
            required: " (obligatoire)",
            keep: " (ne pas supprimer)",
            types: ["Choix unique", "Choix multiple", "Vrai ou faux", "Texte à trous", "Réponse courte"],
            difficulties: ["Facile", "Moyen", "Difficile"],
        },
        "de" => ExportLabels {
            stem: "Frage",
            qtype: "Typ",
            option_prefix: "Option ",
            answer: "Antwort",
            analysis: "Analyse",
            subject: "Fach",
            chapter: "Kapitel",
            difficulty: "Schwierigkeit",
            required: " (erforderlich)",
            keep: " (nicht löschen)",
            types: ["Einzelauswahl", "Mehrfachauswahl", "Wahr oder falsch", "Lückentext", "Kurzantwort"],
            difficulties: ["Leicht", "Mittel", "Schwer"],
        },
        "ru" => ExportLabels {
            stem: "Вопрос",
            qtype: "Тип",
            option_prefix: "Вариант ",
            answer: "Ответ",
            analysis: "Разбор",
            subject: "Предмет",
            chapter: "Глава",
            difficulty: "Сложность",
            required: " (обязательно)",
            keep: " (не удалять)",
            types: ["Одиночный выбор", "Множественный выбор", "Верно или неверно", "Заполнить пропуск", "Краткий ответ"],
            difficulties: ["Легко", "Средне", "Сложно"],
        },
        "ar" => ExportLabels {
            stem: "نص السؤال",
            qtype: "النوع",
            option_prefix: "الخيار ",
            answer: "الإجابة",
            analysis: "التحليل",
            subject: "المادة",
            chapter: "الفصل",
            difficulty: "الصعوبة",
            required: " (مطلوب)",
            keep: " (لا تحذف)",
            types: ["اختيار واحد", "اختيار متعدد", "صح أو خطأ", "إكمال الفراغ", "إجابة قصيرة"],
            difficulties: ["سهل", "متوسط", "صعب"],
        },
        _ => labels_for("zh"),
    }
}

/// 题型 → 本地化标签
pub fn type_label(labels: &ExportLabels, index: usize) -> &'static str {
    labels.types.get(index).copied().unwrap_or(labels.types[TYPE_SHORT_ANSWER])
}

/// 难度 → 本地化标签
pub fn difficulty_label(labels: &ExportLabels, index: usize) -> &'static str {
    labels.difficulties.get(index).copied().unwrap_or(labels.difficulties[DIFF_MEDIUM])
}

/// `QuestionType` 的字符串形式("single_choice" 等) → `types` 下标
pub fn type_index(qtype: &str) -> usize {
    match qtype {
        "single_choice" => TYPE_SINGLE,
        "multi_choice" => TYPE_MULTI,
        "true_false" => TYPE_TRUE_FALSE,
        "fill_blank" => TYPE_FILL_BLANK,
        _ => TYPE_SHORT_ANSWER,
    }
}

/// `Difficulty` 的字符串形式("easy"/"medium"/"hard") → `difficulties` 下标
pub fn difficulty_index(difficulty: &str) -> usize {
    match difficulty {
        "easy" => DIFF_EASY,
        "hard" => DIFF_HARD,
        _ => DIFF_MEDIUM,
    }
}
