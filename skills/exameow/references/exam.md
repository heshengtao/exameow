# 在线考试

## 发布前先确认

`publish_exam` 会在公网创建一个考试码，属于**对外可见**的操作。发布前向用户确认：

- 标题；
- 题量 / 题型 / 每题分值；
- 开始时间与时长；
- 用哪些题（显式 `questions` 还是 `bank_ids`）。

## 发布

```bash
exameow call publish_exam --json '{
  "title": "高数第三章自测",
  "duration_minutes": 60,
  "bank_ids": ["bank-xxx"],
  "type_counts": { "single_choice": 10, "fill_blank": 5 },
  "points": { "single_choice": 4, "fill_blank": 6 },
  "start_at": 1730000000000
}'
```

- `questions` 与 `bank_ids` 二选一。
- `start_at` 是毫秒时间戳；省略 = 现在。
- `duration_minutes` 默认 60；**时间窗必须在 7 天内**。
- 每个 IP 每天最多发布 20 场。
- 返回：`code`、`manage_url`、`admin_token`、`question_count`、`start_at`、`end_at`。

### 凭据处理

- `code` / `manage_url` 可以公开给考生。
- `admin_token` 是**管理凭据**：只私下保存，不要贴进群聊或仓库。
- `manage_url` 用于查看成绩与管理。

## 查成绩

```bash
exameow call get_exam_results --json '{"code":"ABC123","token":"<admin_token>"}'
```

返回提交列表（按 relay 实现）。需要汇总时自己算平均分 / 正确率，不要伪造缺失数据。

## 删除

```bash
exameow call delete_exam --json '{"code":"ABC123","token":"<admin_token>","confirm":true}'
```

- 必须 `confirm:true`。
- 会连同所有提交一起删除，不可恢复；删除前再确认一次。

## 反滥用

- 每 IP 每日发布上限 20 场。
- ≥3 个独立 IP 举报会自动暂停该考试。
- 管理员页：`#/admin`（自托管 / Docker 版）。

## 限制

- 在线考试暂不支持图片题；需要图片请导出 XLSX 发给考生。
- Cloudflare 版 / 自托管版的 relay 域名可能不同；以 App 返回的 `manage_url` 为准。
- 考试码是公开的，不要把 `admin_token` 放进考题说明。
