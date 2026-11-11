# Question Content

Rules for questions, custom topics and admin review, backing CAP-3, CAP-8 and CAP-11. How questions are stored and handed out is fixed by AD-12 in the architecture spine.

## Bank question

| Field | Rule |
| --- | --- |
| Content category | Required. Kerala PSC at launch; the schema also accepts other categories (school quiz, general Kerala) |
| Subject, topic | Required |
| Exam level | 10th / degree / other |
| Difficulty | Required |
| Text | Malayalam and/or English. Shown in the player's chosen language, falling back to the other language |
| Options | Exactly 4 |
| Correct answer | Index 0–3 |
| Explanation | Required |
| Source attribution | Optional, e.g. "Kerala PSC LDC 2019". Shown wherever the question's answer is revealed |

## Review lifecycle

- Every question an admin adds, whether through the form or a CSV upload, starts as **draft**. An admin explicitly **publishes** or **discards** it. MVP has no way for people outside the admin team to submit questions.
- Only published questions are ever served to players.
- A published question is never edited in place. Editing it creates a new version, which goes through review again. Deletion is soft.
- Reports from registered players go to a separate admin queue together with the reporter's note. A report identifies the exact question version. Custom-topic questions cannot be reported.
- The CSV upload uses the same field rules as the table above.

## Custom topic JSON (FR-8.3)

```json
{ "topic": "string",
  "questions": [
    { "question": "string", "options": ["a","b","c","d"], "answer": 0, "explanation": "string" }
  ] }
```

- The import must match the schema and contain at least 1 question, with every required field present. Exactly 4 options; `answer` from 0 to 3.
- Validation errors are reported per field.
- Fair-use caps: 50 topics and 500 questions per user [assumption]. The UI warns at 80% or more, and an import that would go over a cap is blocked with a clear message.
- Topics are private to their owner. The owner can view and delete a topic, and edit it by re-importing.
- The creation screen shows this schema and a sample GPT prompt for generating questions.
- Custom-topic questions are in a single language: whatever language the JSON text is written in.
