# -*- coding: utf-8 -*-
"""
build_data.py — 从 Excel 全量重建 city-pulse-data.js（紧凑数组格式）
读取 39城市数据合并总表.xlsx 的所有宽格式 sheet，合并输出 JS 数据文件
"""
import os, openpyxl, json, re, math
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_PATH = os.path.join(SCRIPT_DIR, '39城市数据合并总表.xlsx')
OUTPUT_PATH = os.path.join(SCRIPT_DIR, 'city-pulse-data.js')

CITY_LEVEL = {
    '北京市':'一线','上海市':'一线','深圳市':'一线','广州市':'一线',
    '杭州市':'新一线','成都市':'新一线','重庆市':'新一线','苏州市':'新一线',
    '南京市':'新一线','武汉市':'新一线','长沙市':'新一线','郑州市':'新一线',
    '东莞市':'新一线','青岛市':'新一线','济南市':'新一线','天津市':'新一线',
    '西安市':'新一线','合肥市':'新一线','福州市':'新一线','厦门市':'新一线',
    '宁波市':'新一线','大连市':'新一线','沈阳市':'新一线','佛山市':'新一线',
    '无锡市':'新一线',
    '温州市':'二线','昆明市':'二线','贵阳市':'二线','南昌市':'二线',
    '石家庄市':'二线','哈尔滨市':'二线','长春市':'二线','太原市':'二线',
    '兰州市':'二线','南宁市':'二线','海口市':'二线','常州市':'二线',
    '嘉兴市':'二线','珠海市':'二线',
}

# ---- 读取所有宽格式 sheet 到 dict ----
wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)

CITY_ADMIN_LEVEL = {
    '北京市':100, '上海市':100, '天津市':100, '重庆市':100,
    '深圳市':80, '广州市':80, '杭州市':80, '成都市':80, '南京市':80, '武汉市':80,
    '西安市':80, '沈阳市':80, '大连市':80, '青岛市':80, '宁波市':80, '厦门市':80,
    '济南市':80, '哈尔滨市':80, '长春市':80,
    '长沙市':70, '郑州市':70, '合肥市':70, '福州市':70, '昆明市':70,
    '贵阳市':70, '南昌市':70, '石家庄市':70, '太原市':70,
    '兰州市':70, '南宁市':70, '海口市':70,
    '苏州市':50, '东莞市':50, '佛山市':50, '无锡市':50, '温州市':50,
    '常州市':50, '嘉兴市':50, '珠海市':50,
}

def norm_city(name):
    """统一城市名：去空格，补'市'"""
    n = str(name).replace('市','').strip()
    return n + '市'

def read_wide(sheet_name):
    """读宽格式 sheet → {城市名: {指标名: 值}}"""
    if sheet_name not in wb.sheetnames:
        print(f'  [!] Sheet not found: {sheet_name}')
        return {}
    ws = wb[sheet_name]
    header = [str(c.value).strip() for c in ws[1]]
    result = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        city = norm_city(row[0])
        d = {}
        for i, val in enumerate(row[1:], 1):
            if i < len(header):
                key = header[i]
                if val is not None:
                    try:
                        d[key] = float(val)
                    except (ValueError, TypeError):
                        d[key] = val
        result[city] = d
    print(f'  [OK] {sheet_name}: {len(result)} cities')
    return result

print('=== Reading wide-format sheets ===')
pop_data     = read_wide('人口_宽格式')
eco_data     = read_wide('经济数据_宽格式')
hitech_data  = read_wide('高新技术企业_宽格式')
housing_data = read_wide('房价与租金_宽格式')
comm_data    = read_wide('商业消费_宽格式')
mall_data    = read_wide('商业设施_宽格式')
med_data     = read_wide('医疗教育与环境_宽格式')
edu_data     = read_wide('教育_宽格式')
trans_data   = read_wide('轨道交通与通勤_宽格式')
trans2_data  = read_wide('餐饮交通_宽格式')
infra_data   = read_wide('市政公用设施（2024）_宽格式')

# ---- 合并所有城市 ----
all_cities = set()
for d in [pop_data, eco_data, hitech_data, housing_data, comm_data, mall_data,
          med_data, edu_data, trans_data, trans2_data, infra_data]:
    all_cities.update(d.keys())

print(f'\n=== Merged: {len(all_cities)} cities ===')

# ---- 辅助函数 ----
def get_val(city_data, key, default=None):
    return city_data.get(key) if city_data.get(key) is not None else default

def nvl(v, default=0):
    return v if (v is not None and (not isinstance(v, float) or not math.isnan(v))) else default

def safe_div(a, b):
    if not b or b == 0: return 0
    return a / b

# ---- 按 tier 分组用于缺失值填充 ----
tier_cities = defaultdict(set)
for city_name in all_cities:
    level = CITY_LEVEL.get(city_name, '二线')
    tier_cities[level].add(city_name)

def tier_mean(data_dict, field, city_name):
    """计算同 tier 城市某指标的均值"""
    level = CITY_LEVEL.get(city_name, '二线')
    vals = []
    for c in tier_cities[level]:
        v = nvl(get_val(data_dict.get(c, {}), field), None)
        if v is not None:
            vals.append(v)
    return sum(vals) / len(vals) if vals else None

def tier_median(data_dict, field, city_name):
    """计算同 tier 城市某指标的中位数"""
    level = CITY_LEVEL.get(city_name, '二线')
    vals = sorted([nvl(get_val(data_dict.get(c, {}), field), None) for c in tier_cities[level]])
    vals = [v for v in vals if v is not None]
    if not vals:
        return None
    mid = len(vals) // 2
    if len(vals) % 2 == 0:
        return (vals[mid - 1] + vals[mid]) / 2
    return vals[mid]

# ---- 构建输出 ----
# 字段定义（按顺序）：[字段名, 单位, 年份]
FIELDS = [
    # D1 经济活力
    ('人均可支配收入', '元', 2024),
    ('GDP', '亿元', 2024),
    ('人均GDP', '元', 2024),
    ('GDP增长率', '%', 2024),
    ('高新技术企业数量', '家', 2024),
    ('科技型中小企业数量', '家', 2024),
    ('高新企业净迁入', '家', 2024),
    ('高新企业迁入数量', '家', 2024),
    ('高新企业迁出数量', '家', 2024),
    ('地方一般公共预算收入', '万元', 2024),
    ('地方一般公共预算支出', '万元', 2024),
    ('社会消费品零售总额', '万元', 2024),
    ('非私营单位平均工资', '元', 2024),
    # D2 住房
    ('房价收入比', '倍', 2024),
    ('新房均价', '元/㎡', 2024),
    ('二手房均价', '元/㎡', 2024),
    ('房租', '元/㎡/月', 2024),
    ('租售比', '', 2024),
    # D3 生活便利
    ('咖啡馆数量', '家', 2024),
    ('电影院数量', '家', 2024),
    ('运动场馆数量', '家', 2024),
    ('酒吧数量', '家', 2024),
    ('购物中心数量', '个', 2024),
    ('购物中心总面积', '万㎡', 2024),
    ('超市便利店数量', '家', 2024),
    ('餐饮门店数量', '家', 2024),
    # D4 医疗
    ('三甲医院数量', '家', 2024),
    ('每千人医疗卫生机构床位数', '张', 2024),
    ('复旦百强加权分', '分', 2024),
    # D5 教育
    ('双一流高校数量', '所', 2024),
    ('高校在校生', '万人', 2024),
    ('普通中学数量', '所', 2024),
    ('普通小学数量', '所', 2024),
    ('中学生师比', '', 2024),
    ('小学生师比', '', 2024),
    ('中职学校数', '所', 2024),
    # D6 环境
    ('年均PM2.5', 'μg/m³', 2024),
    ('人均公园绿地面积', '㎡', 2024),
    ('建成区绿化覆盖率', '%', 2024),
    ('极端高温天数', '天', 2024),
    ('极端低温天数', '天', 2024),
    # D7 交通
    ('通勤时耗', '分钟', 2024),
    ('通勤距离', 'km', 2024),
    ('轨交里程', 'km', 2024),
    ('机场数量', '个', 2024),
    ('高铁可直达城市数', '个', 2024),
    ('建成区路网密度', 'km/km²', 2024),
    # D8 治理
    ('常住人口', '万人', 2024),
    ('财政自给率', '%', 2024),
    ('人均预算支出', '元/人', 2024),
    ('城市行政层级', '分', 2024),
]

field_names = [f[0] for f in FIELDS]
field_units = [f[1] for f in FIELDS]
field_years = [f[2] for f in FIELDS]

result = []
missing_report = {}

for city_name in sorted(all_cities):
    level = CITY_LEVEL.get(city_name, '二线')
    pop = nvl(get_val(pop_data.get(city_name, {}), '常住人口'), 100)

    # 合并所有数据
    e = eco_data.get(city_name, {})
    h = hitech_data.get(city_name, {})
    hs = housing_data.get(city_name, {})
    c = comm_data.get(city_name, {})
    m = mall_data.get(city_name, {})
    md = med_data.get(city_name, {})
    ed = edu_data.get(city_name, {})
    t = trans_data.get(city_name, {})
    t2 = trans2_data.get(city_name, {})
    inf = infra_data.get(city_name, {})

    # 缺失值处理
    city_missing = []

    # 通勤时耗：同 tier 均值填充
    commute = nvl(get_val(t, '通勤时耗(分)'), None)
    if commute is None:
        avg = tier_mean(trans_data, '通勤时耗(分)', city_name)
        commute = round(avg, 1) if avg else 35.0
        city_missing.append(f'通勤时耗→tier均值{commute}')

    # 轨交里程：无轨交输出 None（不是 0）
    metro = nvl(get_val(t, '轨交里程(km)'), None)
    if metro == 0:
        metro = None  # 0 视为缺失
        city_missing.append('轨交里程→null(无轨交)')

    # 通勤距离
    commute_dist = nvl(get_val(t, '通勤距离(km)'), None)

    # 非私营单位平均工资
    wage = nvl(get_val(e, '非私营单位平均工资'), None)

    # 复旦百强加权分
    hosp_rep = nvl(get_val(md, '复旦百强加权分'), None)

    # 中职学校数
    voc = nvl(get_val(ed, '中职学校数'), None)
    voc_ratio = nvl(get_val(ed, '中职生师比'), None)

    if city_missing:
        missing_report[city_name] = city_missing

    # 计算派生指标
    pop_m = pop / 10000

    income = nvl(get_val(e, '地方一般公共预算收入'), None)
    expense = nvl(get_val(e, '地方一般公共预算支出'), None)
    fiscal_ratio = None
    if income and expense and expense > 0:
        fiscal_ratio = round(safe_div(income, expense) * 100, 2)

    budget_per_capita = None
    if expense:
        budget_per_capita = round(safe_div(expense, pop), 2)

    admin_level = CITY_ADMIN_LEVEL.get(city_name, 50)

    # 构建值数组（按 FIELDS 顺序）
    vals = [
        # D1
        nvl(get_val(e, '人均可支配收入'), None),
        nvl(get_val(e, 'GDP'), None),
        nvl(get_val(e, '人均GDP'), None),
        nvl(get_val(e, 'GDP 增长率'), None),
        nvl(get_val(h, '高新技术企业数量'), None),
        nvl(get_val(h, '科技型中小企业数量'), None),
        (nvl(get_val(h, '高新技术企业迁入数量'), 0) - nvl(get_val(h, '高新技术企业迁出数量'), 0)) if get_val(h, '高新技术企业迁入数量') is not None else None,
        nvl(get_val(h, '高新技术企业迁入数量'), None),
        nvl(get_val(h, '高新技术企业迁出数量'), None),
        nvl(get_val(e, '地方一般公共预算收入'), None),
        nvl(get_val(e, '地方一般公共预算支出'), None),
        nvl(get_val(e, '社会消费品零售总额'), None),
        wage,
        # D2
        nvl(get_val(hs, '房价收入比'), None),
        nvl(get_val(hs, '新房均价(元/㎡)'), None),
        nvl(get_val(hs, '二手房均价(元/㎡)'), None),
        nvl(get_val(hs, '房租(元/㎡/月)'), None),
        nvl(get_val(hs, '租售比'), None),
        # D3
        nvl(get_val(c, '咖啡馆数量'), None),
        nvl(get_val(c, '电影院数量'), None),
        nvl(get_val(c, '运动场馆数量'), None),
        nvl(get_val(c, '酒吧数量'), None),
        nvl(get_val(m, '购物中心数量'), None),
        nvl(get_val(m, '购物中心总面积'), None),
        nvl(get_val(t2, '超市便利店数量'), None),
        nvl(get_val(t2, '餐饮门店数量'), None),
        # D4
        nvl(get_val(md, '三甲医院数量(家)'), None),
        nvl(get_val(md, '每千人医疗卫生机构床位数'), None),
        hosp_rep,
        # D5
        nvl(get_val(md, '双一流高校数量(所)'), None),
        nvl(get_val(ed, '高校在校生'), None),
        nvl(get_val(ed, '普通中学数量'), None),
        nvl(get_val(ed, '普通小学数量'), None),
        nvl(get_val(ed, '普通中学生师比'), None),
        nvl(get_val(ed, '普通小学生师比'), None),
        voc,
        # D6
        nvl(get_val(md, '年均PM2.5(μg/m³)'), None),
        nvl(get_val(inf, '人均公园绿地面积(平方米)'), None),
        nvl(get_val(inf, '建成区绿化覆盖率(%)'), None),
        nvl(get_val(md, '极端高温天数(天)'), None),
        nvl(get_val(md, '极端低温天数(天)'), None),
        # D7
        commute,
        commute_dist,
        metro,
        nvl(get_val(t2, '机场数量'), None),
        nvl(get_val(t2, '高铁可直达城市数'), None),
        nvl(get_val(inf, '建成区路网密度(公里/平方公里)'), None),
        # D8
        pop,
        fiscal_ratio,
        budget_per_capita,
        admin_level,
    ]

    # 清理 NaN
    vals = [None if (isinstance(v, float) and math.isnan(v)) else v for v in vals]

    city_record = {
        'name': city_name.replace('市', ''),
        'level': level,
        'v': vals,
    }
    result.append(city_record)

# ---- 输出 JS（紧凑格式）----
header_obj = {
    'fields': field_names,
    'units': field_units,
    'years': field_years,
}

js_lines = [
    '// City Pulse v4 Data — auto-generated from 39城市数据合并总表.xlsx',
    f'// Generated: 2026-05-27 | Cities: {len(result)} | Fields: {len(field_names)} | DO NOT EDIT',
    'window.CITY_DATA_HEADER = ' + json.dumps(header_obj, ensure_ascii=False, indent=None) + ';',
    'window.CITY_DATA = ' + json.dumps(result, ensure_ascii=False, indent=2) + ';',
    ''
]

with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    f.write('\n'.join(js_lines))

file_size = os.path.getsize(OUTPUT_PATH)
print(f'\n[DONE] Output: {OUTPUT_PATH} ({len(result)} cities, {len(field_names)} fields, {file_size/1024:.1f}KB)')

# ---- 报告填充情况 ----
if missing_report:
    print(f'\n[FILLED] Missing fills ({len(missing_report)} cities):')
    for city, fills in sorted(missing_report.items()):
        for f in fills:
            print(f'  {city}: {f}')

# ---- 关键指标覆盖率 ----
indicators_check = ['人均可支配收入', 'GDP', '人均GDP', '房价收入比', '三甲医院数量',
                    '每千人医疗卫生机构床位数', '双一流高校数量', '高校在校生',
                    '年均PM2.5', '通勤时耗', '轨交里程', '财政自给率']
idx_map = {name: i for i, name in enumerate(field_names)}
print(f'\n[COVERAGE] Indicator coverage:')
for ind in indicators_check:
    if ind in idx_map:
        count = sum(1 for r in result if r['v'][idx_map[ind]] is not None)
        print(f'  {ind}: {count}/{len(result)}')
    else:
        print(f'  {ind}: NOT IN FIELDS')
