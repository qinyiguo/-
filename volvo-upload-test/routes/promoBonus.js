const router = require('express').Router();
const pool   = require('../db/pool');

// ── 取得所有促銷獎金規則 ──
router.get('/promo-bonus/configs', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT pbc.*, ssc.config_name AS sa_config_name
      FROM promo_bonus_configs pbc
      LEFT JOIN sa_sales_config ssc ON ssc.id = pbc.sa_config_id
      ORDER BY pbc.sort_order, pbc.id
    `);
    res.json(r.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 新增 ──
router.post('/promo-bonus/configs', async (req, res) => {
  const { rule_name, rule_type, sa_config_id, per_qty, bonus_per_unit,
          part_catalog_types, paycode_types, discount_min, discount_max,
          bonus_pct, role_amounts, target_factories, active, sort_order } = req.body;
  if (!rule_name) return res.status(400).json({ error: '規則名稱為必填' });
  try {
    const r = await pool.query(`
      INSERT INTO promo_bonus_configs
        (rule_name,rule_type,sa_config_id,per_qty,bonus_per_unit,
         part_catalog_types,paycode_types,discount_min,discount_max,
         bonus_pct,role_amounts,target_factories,active,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
    `, [rule_name.trim(), rule_type||'sa_qty', sa_config_id||null,
        per_qty||1, bonus_per_unit||0,
        JSON.stringify(part_catalog_types||[]), JSON.stringify(paycode_types||[]),
        discount_min??null, discount_max??null, bonus_pct||0,
        JSON.stringify(role_amounts||{}), JSON.stringify(target_factories||[]),
        active!==false, sort_order||0]);
    res.json(r.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 更新 ──
router.put('/promo-bonus/configs/:id', async (req, res) => {
  const { rule_name, rule_type, sa_config_id, per_qty, bonus_per_unit,
          part_catalog_types, paycode_types, discount_min, discount_max,
          bonus_pct, role_amounts, target_factories, active, sort_order } = req.body;
  if (!rule_name) return res.status(400).json({ error: '規則名稱為必填' });
  try {
    const r = await pool.query(`
      UPDATE promo_bonus_configs SET
        rule_name=$1,rule_type=$2,sa_config_id=$3,per_qty=$4,bonus_per_unit=$5,
        part_catalog_types=$6,paycode_types=$7,discount_min=$8,discount_max=$9,
        bonus_pct=$10,role_amounts=$11,target_factories=$12,active=$13,
        sort_order=$14,updated_at=NOW()
      WHERE id=$15 RETURNING *
    `, [rule_name.trim(), rule_type||'sa_qty', sa_config_id||null,
        per_qty||1, bonus_per_unit||0,
        JSON.stringify(part_catalog_types||[]), JSON.stringify(paycode_types||[]),
        discount_min??null, discount_max??null, bonus_pct||0,
        JSON.stringify(role_amounts||{}), JSON.stringify(target_factories||[]),
        active!==false, sort_order||0, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: '找不到規則' });
    res.json(r.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 刪除 ──
router.delete('/promo-bonus/configs/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM promo_bonus_configs WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 計算各人促銷獎金結果 ──
router.get('/promo-bonus/results', async (req, res) => {
  const { period, branch } = req.query;
  if (!period) return res.status(400).json({ error: 'period 為必填' });
  try {
    const configs = (await pool.query(`
      SELECT pbc.*, ssc.filters AS sa_filters,
             ssc.stat_method AS sa_stat_method, ssc.person_type AS sa_person_type
      FROM promo_bonus_configs pbc
      LEFT JOIN sa_sales_config ssc ON ssc.id = pbc.sa_config_id
      WHERE pbc.active = true ORDER BY pbc.sort_order, pbc.id
    `)).rows;
    if (!configs.length) return res.json({ configs: [], resultsByConfig: {} });

    const BRANCHES = branch && ['AMA','AMC','AMD'].includes(branch)
      ? [branch] : ['AMA','AMC','AMD'];
    const resultsByConfig = {};

    for (const cfg of configs) {
      resultsByConfig[cfg.id] = { config: cfg, byBranch: {} };

      if (cfg.rule_type === 'sa_qty' && cfg.sa_config_id) {
        const filters    = cfg.sa_filters || [];
        const catCodes   = filters.filter(f=>f.type==='category_code').map(f=>f.value);
        const funcCodes  = filters.filter(f=>f.type==='function_code').map(f=>f.value);
        const partNums   = filters.filter(f=>f.type==='part_number').map(f=>f.value);
        const partTypes  = filters.filter(f=>f.type==='part_type').map(f=>f.value);
        const workCodes  = filters.filter(f=>f.type==='work_code').map(f=>f.value);
        const personType = cfg.sa_person_type || 'sales_person';
        const statMethod = cfg.sa_stat_method || 'amount';
        const perQty     = parseFloat(cfg.per_qty || 1);
        const bonusUnit  = parseFloat(cfg.bonus_per_unit || 0);

        for (const br of BRANCHES) {
          resultsByConfig[cfg.id].byBranch[br] = {};
          try {
            let rows = [];
            if (workCodes.length) {
              const conds=['period=$1','branch=$2']; const p=[period,br]; let idx=3;
              const acTypes=filters.filter(f=>f.type==='account_type').map(f=>f.value);
              if(acTypes.length){conds.push(`account_type=ANY($${idx++})`);p.push(acTypes);}
              const wcConds=[];
              for(const wc of workCodes){
                if(wc.includes('-')){const[fr,to]=wc.split('-').map(s=>s.trim());wcConds.push(`work_code BETWEEN $${idx++} AND $${idx++}`);p.push(fr,to);}
                else{wcConds.push(`work_code=$${idx++}`);p.push(wc);}
              }
              if(wcConds.length)conds.push(`(${wcConds.join(' OR ')})`);
              const expr=statMethod==='amount'?'SUM(wage)':statMethod==='quantity'?'SUM(standard_hours)':'COUNT(DISTINCT work_order)';
              rows=(await pool.query(`SELECT tech_name_clean AS person_name,${expr} AS qty FROM tech_performance WHERE ${conds.join(' AND ')} GROUP BY tech_name_clean`,p)).rows;
            } else {
              const conds=['period=$1','branch=$2']; const p=[period,br]; let idx=3;
              if(catCodes.length){conds.push(`category_code=ANY($${idx++})`);p.push(catCodes);}
              if(funcCodes.length){conds.push(`function_code=ANY($${idx++})`);p.push(funcCodes);}
              if(partNums.length){conds.push(`part_number=ANY($${idx++})`);p.push(partNums);}
              if(partTypes.length){conds.push(`part_type=ANY($${idx++})`);p.push(partTypes);}
              const col=personType==='pickup_person'?'pickup_person':'sales_person';
              const expr=statMethod==='quantity'?'SUM(sale_qty)':statMethod==='count'?'COUNT(*)':'SUM(sale_price_untaxed)';
              rows=(await pool.query(`SELECT ${col} AS person_name,${expr} AS qty FROM parts_sales WHERE ${conds.join(' AND ')} AND ${col} IS NOT NULL AND ${col}!='' GROUP BY ${col}`,p)).rows;
            }
            for(const row of rows){
              if(!row.person_name)continue;
              const bonus=perQty>0?Math.floor(parseFloat(row.qty||0)/perQty)*bonusUnit:0;
              if(bonus>0)resultsByConfig[cfg.id].byBranch[br][row.person_name]=bonus;
            }
          } catch(e){console.error('[promoBonus] sa_qty:',e.message);}
        }

      } else if (cfg.rule_type === 'parts_discount') {
        const catalogTypes=cfg.part_catalog_types||[];
        const paycodes=cfg.paycode_types||[];
        const discMin=cfg.discount_min!=null?parseFloat(cfg.discount_min):null;
        const discMax=cfg.discount_max!=null?parseFloat(cfg.discount_max):null;
        const bonusPct=parseFloat(cfg.bonus_pct||0)/100;

        for(const br of BRANCHES){
          resultsByConfig[cfg.id].byBranch[br]={};
          try{
            const conds=['ps.period=$1','ps.branch=$2']; const p=[period,br]; let idx=3;
            if(catalogTypes.length){conds.push(`pc.part_type=ANY($${idx++})`);p.push(catalogTypes);}
            if(paycodes.length){conds.push(`ps.part_type=ANY($${idx++})`);p.push(paycodes);}
            if(discMin!=null){conds.push(`ps.discount_rate>=$${idx++}`);p.push(discMin);}
            if(discMax!=null){conds.push(`ps.discount_rate<=$${idx++}`);p.push(discMax);}
            conds.push(`ps.sales_person IS NOT NULL AND ps.sales_person!=''`);
            const r=await pool.query(`SELECT ps.sales_person AS person_name,COALESCE(SUM(ps.sale_price_untaxed),0) AS total_sales FROM parts_sales ps JOIN parts_catalog pc ON pc.part_number=ps.part_number WHERE ${conds.join(' AND ')} GROUP BY ps.sales_person`,p);
            for(const row of r.rows){
              const bonus=Math.round(parseFloat(row.total_sales||0)*bonusPct);
              if(bonus>0)resultsByConfig[cfg.id].byBranch[br][row.person_name]=bonus;
            }
          }catch(e){console.error('[promoBonus] parts_discount:',e.message);}
        }
      }
    }
    res.json({ configs, resultsByConfig });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
