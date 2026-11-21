"""WHO 2006 Child Growth Standards calculator (0--60 completed months)."""
from __future__ import annotations
import hashlib, math, re, zipfile
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path
from backend.utils.gender import normalize_gender_to_sex

REFERENCE_VERSION="WHO Child Growth Standards 2006"
REFERENCE_DIR=Path(__file__).resolve().parents[1]/"resources"/"who_growth_2006"
MAX_AGE_DAYS=1856
NS={"m":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
FILES={("WFA","M"):"wfa_boys_expanded.xlsx",("WFA","F"):"wfa_girls_expanded.xlsx",("LHFA","M"):"lhfa_boys_expanded.xlsx",("LHFA","F"):"lhfa_girls_expanded.xlsx",("WFL","M"):"wfl_boys_expanded.xlsx",("WFL","F"):"wfl_girls_expanded.xlsx",("WFH","M"):"wfh_boys_expanded.xlsx",("WFH","F"):"wfh_girls_expanded.xlsx"}
KEYS={"WFA":"Day","LHFA":"Day","WFL":"Length","WFH":"Height"}
class WHOInputError(ValueError): pass
def _col(ref):
    n=0
    for c in re.match(r"[A-Z]+",ref).group(): n=n*26+ord(c)-64
    return n-1
def _xlsx(path):
    with zipfile.ZipFile(path) as z:
        strings=[]
        if "xl/sharedStrings.xml" in z.namelist(): strings=["".join(n.itertext()) for n in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si",NS)]
        sheet=ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    data=[]
    for row in sheet.findall(".//m:row",NS):
        cells={}
        for cell in row.findall("m:c",NS):
            raw=cell.find("m:v",NS)
            if raw is not None: cells[_col(cell.get("r"))]=strings[int(raw.text)] if cell.get("t")=="s" else raw.text
        if cells: data.append([cells.get(i,"") for i in range(max(cells)+1)])
    headers=[str(v) for v in data[0]]
    return [{headers[i]:float(v) for i,v in enumerate(row) if i<len(headers) and v!=""} for row in data[1:]]
@lru_cache(maxsize=None)
def _rows(indicator,sex): return {float(r[KEYS[indicator]]):r for r in _xlsx(REFERENCE_DIR/FILES[(indicator,sex)])}
def _sex(value):
    sex=normalize_gender_to_sex(value)
    if sex is None: raise WHOInputError("Gender must be Male or Female for WHO calculation.")
    return sex
def _positive(value,name):
    try: value=float(value)
    except (TypeError,ValueError) as e: raise WHOInputError(f"{name} must be numeric.") from e
    if not math.isfinite(value) or value<=0: raise WHOInputError(f"{name} must be greater than zero.")
    return value
def _day(value):
    try: day=int(value)
    except (TypeError,ValueError) as e: raise WHOInputError("age_days must be an integer from 0 to 1856.") from e
    if isinstance(value,bool) or day!=value or not 0<=day<=MAX_AGE_DAYS: raise WHOInputError("age_days must be an integer from 0 to 1856.")
    return day
def _row(indicator,sex,point):
    if indicator in {"WFL","WFH"}: point=round(point,1)
    row=_rows(indicator,sex).get(point)
    if row is None: raise WHOInputError(f"{indicator} reference is unavailable for this measurement.")
    return row
def _z(value,row):
    l,m,s=row["L"],row["M"],row["S"]
    z=math.log(value/m)/s if l==0 else ((value/m)**l-1)/(l*s)
    if z>3: return 3+(value-row["SD3"])/(row["SD3"]-row["SD2"])
    if z<-3: return -3+(value-row["SD3neg"])/(row["SD2neg"]-row["SD3neg"])
    return z
def _adjust(age,value,method):
    value=_positive(value,"height_cm")
    if method not in {"recumbent_length","standing_height"}: raise WHOInputError("measurement_method is required and must be recumbent_length or standing_height.")
    if age<274 and method=="standing_height": raise WHOInputError("standing height is unsupported below nine months.")
    return ((value+0.7 if method=="standing_height" else value),"WFL") if age<731 else ((value-0.7 if method=="recumbent_length" else value),"WFH")
def compute_assessment(*,age_days,sex,weight_kg,height_cm,measurement_method):
    age=_day(age_days); sex=_sex(sex); weight=_positive(weight_kg,"weight_kg"); adjusted,indicator=_adjust(age,height_cm,measurement_method)
    score=_z(weight,_row(indicator,sex,adjusted))
    return {"waz":_z(weight,_row("WFA",sex,float(age))),"haz":_z(adjusted,_row("LHFA",sex,float(age))),"wlz":score if indicator=="WFL" else None,"whz":score if indicator=="WFH" else None,"length_height_indicator":indicator,"adjusted_length_height_cm":adjusted,"reference_version":REFERENCE_VERSION,"calculation_status":"verified"}
def compute_z_scores(*,age_days,sex,weight_kg,height_cm,measurement_method):
    r=compute_assessment(age_days=age_days,sex=sex,weight_kg=weight_kg,height_cm=height_cm,measurement_method=measurement_method)
    return tuple(round(v,3) for v in (r["waz"],r["haz"],r["wlz"] if r["wlz"] is not None else r["whz"]))
def reference_manifest(): return {n:hashlib.sha256((REFERENCE_DIR/n).read_bytes()).hexdigest() for n in sorted(set(FILES.values()))}
