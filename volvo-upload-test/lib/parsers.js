const { pick, num, parseDate, parseDateTime } = require('./utils');

// ── 只排除完全空白的列，不用中文字判斷（避免過濾掉合法資料）──
const isCellEmpty = (v) => {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === '' || s === 'undefined' || s === 'null';
};

// 工單號是否為合法值（非空、非純中文標題）
const isValidWorkOrder = (v) => {
  if (isCellEmpty(v)) return false;
  const s = String(v).trim();
  // 只有純中文且沒有數字的視為標題列（例如「工作單號」「合計」「小計」）
  if (/^[\u4e00-\u9fff\s]+$/.test(s)) return false;
  return true;
};

// ── 維修收入分類明細 ──
const parseRepairIncome = (rows, branch, period) => {
  const results = [];
  for (const r of rows) {
    const wo = String(pick(r, '工作單號', '工單號', 'WorkOrder', '单号') || '').trim();
    if (!isValidWorkOrder(wo)) continue;

    results.push({
      period,
      branch,
      work_order:           wo,
      settle_date:          parseDate(pick(r, '結算日期', '结算日期', 'SettleDate')),
      customer:             String(pick(r, '客戶名稱', '客户名称', '客戶', '客户') || '').trim(),
      plate_no:             String(pick(r, '車牌號碼', '车牌号码', '車牌', '车牌') || '').trim(),
      account_type_code:    String(pick(r, '帳類代碼', '帐类代码', '帳類碼') || '').trim(),
      account_type:         String(pick(r, '帳類', '帐类', 'AccountType') || '').trim(),
      parts_income:         num(pick(r, '零件收入')),
      accessories_income:   num(pick(r, '配件收入')),
      boutique_income:      num(pick(r, '精品收入')),
      engine_wage:          num(pick(r, '引擎工資', '工資收入', '引擎工资', '工资收入')),
      bodywork_income:      num(pick(r, '鈑金收入', '钣金收入')),
      paint_income:         num(pick(r, '烤漆收入')),
      carwash_income:       num(pick(r, '洗車美容收入', '洗车美容收入', '洗車收入', '洗车收入')),
      outsource_income:     num(pick(r, '外包收入')),
      addon_income:         num(pick(r, '附加服務收入', '附加服务收入', '附加服務', '附加服务')),
      total_untaxed:        num(pick(r, '收入合計（未稅）', '收入合计（未税）', '收入合計(未稅)', '收入合计(未税)', '收入合計', '收入合计')),
      total_taxed:          num(pick(r, '收入合計(含稅)', '收入合计(含税)', '收入合計（含稅）', '收入合计（含税）')),
      parts_cost:           num(pick(r, '零件成本（未稅）', '零件成本（未税）', '零件成本(未稅)', '零件成本(未税)', '零件成本')),
      service_advisor:      String(pick(r, '服務顧問', '服务顾问', '接待員', '接待员') || '').trim(),
    });
  }
  return results;
};

// ── 技師績效報表 ──
const parseTechPerformance = (rows, branch, period) => {
  const results = [];
  for (const r of rows) {
    const wo = String(pick(r, '工作單號', '工單號', '工作单号', '工单号') || '').trim();
    if (!isValidWorkOrder(wo)) continue;

    const techRaw = String(pick(r, '技師姓名', '技师姓名', '姓名') || '').trim();
    // 若技師姓名是純中文標題也跳過
    if (!techRaw || /^[\u4e00-\u9fff\s]+$/.test(techRaw) && techRaw === '技師姓名') continue;

    results.push({
      period,
      branch,
      tech_name_raw:   techRaw,
      tech_name_clean: techRaw.replace(/\s+/g, ''),
      dispatch_date:   parseDate(pick(r, '出廠日期', '出厂日期')),
      work_order:      wo,
      work_code:       String(pick(r, '維修工時代碼', '维修工时代码', '工時代碼', '工时代码') || '').trim(),
      task_content:    String(pick(r, '作業內容', '作业内容') || '').trim(),
      standard_hours:  num(pick(r, '標準工時', '标准工时')),
      wage:            num(pick(r, '工資', '工资')),
      account_type:    String(pick(r, '帳類', '帐类') || '').trim(),
      discount:        num(pick(r, '折扣')),
      wage_category:   String(pick(r, '工資類別', '工资类别') || '').trim(),
    });
  }
  return results;
};

// ── 零件銷售明細 ──
const parsePartsSales = (rows, branch, period) => {
  const results = [];
  for (const r of rows) {
    // 零件銷售沒有固定主鍵，用結帳單號或零件編號判斷是否有效列
    const orderNo  = String(pick(r, '結帳單號', '结帐单号') || '').trim();
    const partNum  = String(pick(r, '零件編號', '零件编号') || '').trim();
    const partName = String(pick(r, '零件名稱', '零件名称') || '').trim();

    // 若三個欄位都空，視為無效列
    if (isCellEmpty(orderNo) && isCellEmpty(partNum) && isCellEmpty(partName)) continue;

    // 偵測是否為標題行（全中文且沒有任何數字）
    const firstVal = String(Object.values(r)[0] || '').trim();
    if (/^[\u4e00-\u9fff\s]+$/.test(firstVal) && !/\d/.test(firstVal) && firstVal.length < 10) continue;

    const rowBranch = branch || (() => {
      const b = String(r['據點代碼'] || r['据点代码'] || r['據點'] || r['据点'] || r['點'] || r['分店'] || '').toUpperCase().trim();
      return ['AMA', 'AMC', 'AMD'].includes(b) ? b : null;
    })();

    results.push({
      period,
      branch: rowBranch,
      category:            String(pick(r, '類別', '类别') || '').trim(),
      category_detail:     String(pick(r, '類別細節', '类别细节', '類別明細', '类别明细') || '').trim(),
      order_no:            orderNo,
      work_order:          String(pick(r, '工單號', '工单号', '工作單號', '工作单号') || '').trim(),
      part_number:         partNum,
      part_name:           partName,
      part_type:           String(pick(r, 'Paycode', '種類', '种类', '零件種類', '零件种类') || '').trim(),
      category_code:       String(pick(r, '零件類別', '零件类别') || '').trim(),
      function_code:       String(pick(r, '功能碼', '功能码') || '').trim(),
      sale_qty:            num(pick(r, '銷售數量', '销售数量', '數量', '数量')),
      retail_price:        num(pick(r, '零售價', '零售价')),
      sale_price_untaxed:  num(pick(r, '實際售價(稅前)', '实际售价(税前)', '實際售價(未稅)', '实际售价(未税)', '實際售價', '实际售价')),
      cost_untaxed:        num(pick(r, '成本總價(稅前)', '成本总价(税前)', '成本(未稅)', '成本(未税)', '成本')),
      discount_rate:       num(pick(r, '折扣率', '折扣')),
      department:          String(pick(r, '付款部門', '付款部门', '部門', '部门') || '').trim(),
      pickup_person:       String(pick(r, '領料人員', '领料人员', '領料人', '领料人', '接待人員', '接待人员') || '').trim(),
      sales_person:        String(pick(r, '銷售人員', '销售人员', '業務員', '业务员') || '').trim(),
      plate_no:            String(pick(r, '車牌號碼', '车牌号码', '車牌', '车牌') || '').trim(),
    });
  }
  return results;
};

// ── 業務查詢 ──
const parseBusinessQuery = (rows, branch, period) => {
  const results = [];
  for (const r of rows) {
    const wo = String(pick(r, '工單號', '工单号', '工作單號', '工作单号') || '').trim();
    // 業務查詢至少要有工單號或車牌才算有效列
    const plate = String(pick(r, '車牌號碼', '车牌号码', '車牌號', '车牌号', '車牌', '车牌') || '').trim();
    if (isCellEmpty(wo) && isCellEmpty(plate)) continue;
    if (/^[\u4e00-\u9fff\s]+$/.test(wo) && wo !== '') continue; // 純中文 = 標題

    const rowBranch = branch || (() => {
      const b = String(r['據點代碼'] || r['据点代码'] || r['據點'] || r['据点'] || r['點'] || r['分店'] || '').toUpperCase().trim();
      return ['AMA', 'AMC', 'AMD'].includes(b) ? b : null;
    })();

    results.push({
      period,
      branch: rowBranch,
      work_order:     wo,
      open_time:      parseDateTime(pick(r, '工單開單時間', '工单开单时间', '開單時間', '开单时间', '開工時間', '开工时间', '進廠時間', '进厂时间', '開立時間', '开立时间', '開單日期', '开单日期', '接車時間', '接车时间')),
      settle_date:    parseDate(pick(r, '結算日期', '结算日期')),
      plate_no:       plate,
      vin:            String(pick(r, '車身號碼', '车身号码', 'VIN') || '').trim(),
      status:         String(pick(r, '工單狀態', '工单状态', '狀態', '状态') || '').trim(),
      repair_item:    String(pick(r, '交修項目', '交修项目') || '').trim(),
      service_advisor:String(pick(r, '服務顧問', '服务顾问') || '').trim(),
      assigned_tech:  String(pick(r, '指定技師', '指定技师') || '').trim(),
      repair_tech:    String(pick(r, '維修技師', '维修技师') || '').trim(),
      repair_type:    String(pick(r, '維修類型', '维修类型') || '').trim(),
      car_series:     String(pick(r, '車系', '车系') || '').trim(),
      car_model:      String(pick(r, '車型', '车型') || '').trim(),
      model_year:     String(pick(r, '年式', '年份') || '').trim(),
      owner:          String(pick(r, '車主', '车主') || '').trim(),
      is_ev:          String(pick(r, '電車', '油電', '動力', '动力') || '').trim(),
      mileage_in:     parseInt(pick(r, '進廠里程', '进厂里程')) || null,
      mileage_out:    parseInt(pick(r, '出廠里程', '出厂里程')) || null,
    });
  }
  return results;
};

// ── 零配件比對（型錄）──
const parsePartsCatalog = (rows) => {
  const results = [];
  for (const r of rows) {
    const pn = String(pick(r, '零件編號', '零件编号', '料號', '料号') || '').trim();
    if (isCellEmpty(pn) || /^[\u4e00-\u9fff\s]+$/.test(pn)) continue;

    results.push({
      part_number:   pn,
      part_name:     String(pick(r, '零件名稱', '零件名称', '品名') || '').trim(),
      part_category: String(pick(r, '零件類別', '零件类别') || '').trim(),
      part_type:     String(pick(r, '零件種類', '零件种类', '種類', '种类') || '').trim(),
      category_code: String(pick(r, '零件類別', '零件类别') || '').trim(),
      function_code: String(pick(r, '功能碼', '功能码') || '').trim(),
      branch:        String(pick(r, '據點', '据点') || '').trim() || null,
    });
  }
  return results;
};

module.exports = {
  parseRepairIncome,
  parseTechPerformance,
  parsePartsSales,
  parseBusinessQuery,
  parsePartsCatalog,
};
