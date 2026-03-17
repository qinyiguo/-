# -volvo-upload-test/
├── index.js                    (main entry, ~80 lines)
├── db/
│   └── init.js                 (initDatabase)
├── lib/
│   ├── parsers.js              (pick, num, parseDate, parseDateTime, detectFileType, detectBranch, detectPeriod, isNoteRow, parseRepairIncome, parseTechPerformance, parsePartsSales, parseBusinessQuery, parsePartsCatalog)


│   └── db.js                   (pool, batchInsert, upsertPartsCatalog)
├── routes/
│   ├── upload.js               (/api/upload, /api/upload-revenue-targets, etc.)
│   ├── saConfig.js             (/api/sa-config/*)
│   ├── incomeConfig.js         (/api/income-config/*)
│   ├── workingDays.js          (/api/working-days/*)
│   ├── stats.js                (/api/stats/*)
│   └── query.js                (/api/query/*)
