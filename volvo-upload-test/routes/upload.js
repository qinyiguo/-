const router = require('express').Router();
const multer = require('multer');
const XLSX   = require('xlsx');
const pool   = require('../db/pool');
const { detectFileType, detectBranch, detectPeriod } = require('../lib/utils');
const {
  parseRepairIncome, parseTechPerformance,
  parsePartsSales, parseBusinessQuery, parsePartsCatalog,
} = require('../lib/parsers');
const { batchInsert, upsertPartsCatalog } = require('../lib/batchInsert');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/upload', upload.array('files', 8), async (req, res) => {
  const results = [];
  for (const file of req.files) {
    let filename = file.originalname;
    try { filename = Buffer.from(file.originalname,'latin1').toString('utf8'); } catch(e) {}
    try {
      const workbook = XLSX.read(file.buffer, { type:'buffer', cellDates:true });
      const fileType  = detectFileType(filename, workbook.SheetNames);
      const branch    = detectBranch(filename);
      const period    = detectPeriod(filename);
      if (!fileType) throw new Error('無法辨識檔案類型，請確認檔名包含關鍵字（維修收入/技師績效/零件銷售/業務查詢）');
      const sheet   = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval:'' });
      if (rawRows.length > 0) console.log(`[${filename}] 欄位: ${Object.keys(rawRows[0]).join(' | ')}`);
      const client = await pool.connect();
      let rowCount = 0;
      try {
        await client.query('BEGIN');
        if (fileType === 'repair_income') {
          if (!branch||!period) throw new Error('維修收入需要據點和期間');
          await client.query('DELETE FROM repair_income WHERE period=$1 AND branch=$2',[period,branch]);
          rowCount = await batchInsert(client,'repair_income',
            ['period','branch','work_order','settle_date','customer','plate_no','account_type_code','account_type',
             'parts_income','accessories_income','boutique_income','engine_wage','bodywork_income','paint_income',
             'carwash_income','outsource_income','addon_income','total_untaxed','total_taxed','parts_cost','service_advisor'],
            parseRepairIncome(rawRows,branch,period));
        } else if (fileType === 'tech_performance') {
          if (!branch||!period) throw new Error('技師績效需要據點和期間');
          await client.query('DELETE FROM tech_performance WHERE period=$1 AND branch=$2',[period,branch]);
          rowCount = await batchInsert(client,'tech_performance',
            ['period','branch','tech_name_raw','tech_name_clean','dispatch_date','work_order','work_code',
             'task_content','standard_hours','wage','account_type','discount','wage_category'],
            parseTechPerformance(rawRows,branch,period));
        } else if (fileType === 'parts_sales') {
          if (!period) throw new Error('零件銷售需要期間');
          branch ? await client.query('DELETE FROM parts_sales WHERE period=$1 AND branch=$2',[period,branch])
                 : await client.query('DELETE FROM parts_sales WHERE period=$1',[period]);
          rowCount = await batchInsert(client,'parts_sales',
            ['period','branch','category','category_detail','order_no','work_order','part_number','part_name',
             'part_type','category_code','function_code','sale_qty','retail_price','sale_price_untaxed',
             'cost_untaxed','discount_rate','department','pickup_person','sales_person','plate_no'],
            parsePartsSales(rawRows,branch,period));
        } else if (fileType === 'business_query') {
          if (!period) throw new Error('業務查詢需要期間');
          branch ? await client.query('DELETE FROM business_query WHERE period=$1 AND branch=$2',[period,branch])
                 : await client.query('DELETE FROM business_query WHERE period=$1',[period]);
          rowCount = await batchInsert(client,'business_query',
            ['period','branch','work_order','open_time','settle_date','plate_no','vin','status','repair_item',
             'service_advisor','assigned_tech','repair_tech','repair_type','car_series','car_model',
             'model_year','owner','is_ev','mileage_in','mileage_out'],
            parseBusinessQuery(rawRows,branch,period));
        } else if (fileType === 'parts_catalog') {
          rowCount = await upsertPartsCatalog(client, parsePartsCatalog(rawRows));
        }
        await client.query(
          `INSERT INTO upload_history (file_name,file_type,branch,period,row_count,status) VALUES ($1,$2,$3,$4,$5,'success')`,
          [filename,fileType,branch,period,rowCount]);
        await client.query('COMMIT');
        results.push({ filename, status:'success', fileType, branch, period, rowCount });
      } catch (err) {
        await client.query('ROLLBACK'); throw err;
      } finally { client.release(); }
    } catch (err) {
      results.push({ filename, status:'error', error:err.message });
      try { await pool.query(`INSERT INTO upload_history (file_name,file_type,status,error_msg) VALUES ($1,'unknown','error',$2)`,[filename,err.message]); } catch(e) {}
    }
  }
  res.json({ results });
});

module.exports = router;
