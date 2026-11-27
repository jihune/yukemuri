# ruff: noqa: UP031  (a subagent's one-off recount; the code is kept as it ran)
"""Recount of page-interval reads for UTC day D from GitHub Actions logs.
usage: python3 -I recount26.py <LOGS dir> <out json> [D]
"""
import json
import math
import re
import statistics
import sys
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from pathlib import Path

LOGS = Path(sys.argv[1])
OUT = Path(sys.argv[2])
D = sys.argv[3] if len(sys.argv) > 3 else "2026-11-26"
POST_FROM = datetime(2026, 11, 26, 0, 30, 21, tzinfo=timezone.utc)
BACKUP = (
    datetime.fromisoformat(D + "T00:13:00+00:00"),
    datetime.fromisoformat(D + "T00:20:00+00:00"),
)
THIRTY = timedelta(minutes=30)

TS = re.compile(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?Z ?(.*)$")
SIZE = re.compile(r"reason=today (\d+) rows written, (\d+) read")
SNAP = re.compile(r"Search snapshot ([0-9a-f]{8,}): (\d+) hotels,(.*?)(\d+) queries, (\d+) rows read, (\d+)ms")


def ts(s, frac):
    base = datetime.strptime(s, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    us = int((frac or "0")[:6].ljust(6, "0"))
    return base + timedelta(microseconds=us)


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond:06d}Z"


def parse_t(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def lines(path):
    text = (LOGS / path).read_text(encoding="utf-8")
    for raw in text.splitlines():
        m = TS.match(raw)
        if m:
            yield ts(m.group(1), m.group(2)), m.group(3)


def one_decimal(fr):
    fr = Fraction(fr)
    return str((Decimal(fr.numerator) / Decimal(fr.denominator)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


manifest = json.loads((LOGS / "manifest.json").read_text(encoding="utf-8"))

# ---- per run: Size line, pages, snapshots
runs = []
snaps = []
usage_T = None
for r in manifest["runs"]:
    wf = r["workflow"]
    day = r["created_at"][:10]
    for j in r["jobs"]:
        if not j["log_file"]:
            continue
        if wf in ("collect.yml", "deploy.yml", "lifecycle.yml") and day == D:
            for t, body in lines(j["log_file"]):
                m = SNAP.search(body)
                if m:
                    n_rows = int(m.group(5))
                    ms = int(m.group(6))
                    snaps.append({
                        "run_id": r["run_id"], "job": j["name"], "id": m.group(1),
                        "line_time": t, "ms": ms, "start": t - timedelta(milliseconds=ms),
                        "N": n_rows, "queries": int(m.group(4)),
                        "again": "published again" in body,
                    })
        if wf == "usage.yml":
            for t, body in lines(j["log_file"]):
                if body.startswith("| " + D + " |"):
                    cells = [c.strip() for c in body.split("|")]
                    # cells[0] is '' ; the 9th column is cells[9]
                    usage_T = int(cells[9].split(" ")[0].replace(",", ""))
    if wf == "collect.yml" and day == D:
        cj = next(j for j in r["jobs"] if j["name"] == "collect")
        size = None
        counts = {"done": 0, "retry": 0, "failed": 0}
        for t, body in lines(cj["log_file"]):
            m = SIZE.search(body)
            if m and size is None:
                size = (t, int(m.group(1)), int(m.group(2)))
            if body.startswith("{"):
                try:
                    o = json.loads(body)
                except ValueError:
                    continue
                if isinstance(o, dict) and "url" in o and "sourceDiagnostic" not in o and o.get("status") in counts:
                    counts[o["status"]] += 1
        if size is None:
            continue
        snapj = next((j for j in r["jobs"] if j["name"].startswith("snapshot") and j["completed_at"] and j["log_file"]), None)
        end_job = snapj or cj
        last_job_end = max(parse_t(j["completed_at"]) for j in r["jobs"] if j["completed_at"] and j["log_file"])
        runs.append({
            "run_id": r["run_id"], "created_at": r["created_at"],
            "S": size[0], "W": size[1], "R": size[2],
            "p": sum(counts.values()), "counts": counts,
            "end": parse_t(end_job["completed_at"]), "end_kind": "snapshot" if snapj else "collect",
            "last_job_end": last_job_end,
        })
runs.sort(key=lambda x: x["S"])


def snap_sum(lo, hi=None):
    return sum(s["N"] for s in snaps if s["start"] >= lo and (hi is None or s["start"] < hi))


# ---- intervals
intervals = []
for i, run in enumerate(runs):
    if run["p"] < 1:
        continue
    nxt = next((x for x in runs if x["S"] > run["end"]), None)
    iv = {"run_id": run["run_id"], "S": run["S"], "p": run["p"], "counts": run["counts"],
          "end": run["end"], "end_kind": run["end_kind"], "R": run["R"],
          "S_next": nxt["S"] if nxt else None, "R_next": nxt["R"] if nxt else None,
          "post": run["S"] > POST_FROM, "reasons": []}
    if nxt is None:
        iv["reasons"].append("S_next 없음")
    else:
        gap = nxt["S"] - run["end"]
        iv["gap_s"] = gap.total_seconds()
        iv["gap_if_last_job_end_s"] = (nxt["S"] - run["last_job_end"]).total_seconds()
        if gap > THIRTY:
            iv["reasons"].append("S_next가 끝난 시각보다 30분 넘게 뒤(%s)" % gap)
        iv["dR"] = nxt["R"] - run["R"]
        iv["sum_snap"] = snap_sum(run["S"], nxt["S"])
        iv["snap_in"] = [s["id"] for s in snaps if run["S"] <= s["start"] < nxt["S"]]
        # other runs (not i, not the owner of S_next) whose Size line lies in (S_i, S_next) and got pages
        others = [x["run_id"] for x in runs if x is not run and x is not nxt and run["S"] < x["S"] < nxt["S"] and x["p"] >= 1]
        iv["other_page_runs_inside"] = others
        # sensitivity: runs whose job start (created_at) is inside, owner of S_next included
        if others:
            iv["reasons"].append("사이에 쪽을 받은 다른 실행 %s" % others)
        if run["S"] < BACKUP[1] and nxt["S"] > BACKUP[0]:
            iv["reasons"].append("제외(백업) 00:13-00:20Z와 겹침")
        iv["a_fr"] = Fraction(iv["dR"] - iv["sum_snap"], run["p"])
        iv["a"] = one_decimal(iv["a_fr"])
    if run["p"] < 20:
        iv["reasons"].append("p<20")
    iv["used"] = not iv["reasons"]
    intervals.append(iv)

post_used = [iv for iv in intervals if iv["used"] and iv["post"]]

# ---- a_last
last = next((x for x in reversed(runs) if x["p"] >= 1), None)
T = usage_T
a_last = None
res = {"T": T}
if last and T is not None:
    sum_after = snap_sum(last["S"])
    a_fr = Fraction(T - last["R"] - sum_after, last["p"])
    maxa = max((iv["a_fr"] for iv in post_used), default=None)
    cond_p = last["p"] >= 20
    cond_a = maxa is not None and a_fr <= Fraction(13, 10) * maxa
    a_last = {
        "run_id": last["run_id"], "S": last["S"], "R_last": last["R"], "sum_snap_after": sum_after,
        "p": last["p"], "a_fr": a_fr, "a": one_decimal(a_fr),
        "max_post_a": one_decimal(maxa) if maxa is not None else None,
        "limit_1_3x": one_decimal(Fraction(13, 10) * maxa) if maxa is not None else None,
        "cond_p_ge_20": cond_p, "cond_a_le_1_3_max": cond_a, "passes": bool(cond_p and cond_a),
        "same_run_as_interval_point": any(iv["run_id"] == last["run_id"] for iv in post_used),
    }

new_snaps = [s for s in snaps if not s["again"]]
Nmax = max((s["N"] for s in new_snaps), default=None)


def verdict(points):
    n = len(points)
    out = {"n": n, "points": [one_decimal(x) for x in points]}
    if n:
        A = max(points)
        M = Fraction(statistics.median(points)) if n else None
        out["A_post"] = one_decimal(A)
        out["M"] = one_decimal(M)
        rpp = math.ceil(Fraction(115, 100) * A / 100) * 100
        out["rppNew"] = rpp
    if n < 3 or T is None:
        out["verdict"] = "WAIT"
    elif A > 6100:
        out["verdict"] = "REGRESSION"
    elif A > 2 * M:
        out["verdict"] = "OUTLIER"
    elif T > 4350000:
        out["verdict"] = "UNSETTLED"
    elif rpp <= 4900:
        out["verdict"] = "LOWER"
    else:
        out["verdict"] = "KEEP"
    if Nmax is not None:
        out["snapshot_rule"] = {
            "Nmax": Nmax, "Nmax_x1_05": float(Fraction(105, 100) * Nmax),
            "exceeds_168000": Fraction(105, 100) * Nmax > 168000,
            "snapshotReads_if_raised": math.ceil(Fraction(105, 100) * Nmax / 1000) * 1000,
        }
    return out


pts_a = [iv["a_fr"] for iv in post_used]
reading_a = verdict(pts_a)  # (가) same run counted once
pts_b = list(pts_a)
if a_last and a_last["passes"]:
    pts_b.append(a_last["a_fr"])  # (나) a_last added as one more point
reading_b = verdict(pts_b)
# (가): a_last passes but same run => no extra point. If a_last run is not an interval run, it adds a point.
if a_last and a_last["passes"] and not a_last["same_run_as_interval_point"]:
    reading_a = reading_b


def ser(o):
    if isinstance(o, datetime):
        return iso(o)
    if isinstance(o, Fraction):
        return {"exact": f"{o.numerator}/{o.denominator}", "a": one_decimal(o)}
    if isinstance(o, timedelta):
        return o.total_seconds()
    raise TypeError(type(o))


result = {
    "day": D, "post_from": iso(POST_FROM),
    "runs_with_size_line": [{"run_id": x["run_id"], "S": x["S"], "W": x["W"], "R": x["R"], "p": x["p"],
                             "counts": x["counts"], "end": x["end"], "end_kind": x["end_kind"],
                             "last_job_end": x["last_job_end"]} for x in runs],
    "snapshots": [{"run_id": s["run_id"], "id": s["id"], "start": s["start"], "line_time": s["line_time"],
                   "N": s["N"], "again": s["again"]} for s in snaps],
    "intervals": intervals,
    "a_last": a_last, "T": T, "Nmax": Nmax,
    "reading_a_same_run_once": reading_a,
    "reading_b_a_last_extra_point": reading_b,
    "rule_ambiguities": [
        "끝난 시각: 'snapshot job'을 매니페스트의 job 이름 'snapshot / deploy'(completed_at)로 읽었다. chain job 끝(마지막 job 끝)으로 읽으면 45738105492의 간격이 1799.9996초가 되어 30분 이내로 바뀌고(구간이 하나 더 값으로 쓰임, a=5814.2) 판정은 같다(참고 계산).",
        "다른 실행 조건: '(S_i, S_next) 사이에 시작한 다른 실행'을 Size 줄 시각이 열린 구간 안에 드는 실행으로 읽고, S_next를 낸 실행 자체는 '다른 실행'에서 뺐다. 그 실행을 세면 쪽을 받은 다음 실행이 있는 구간이 모두 제외된다.",
        "Size 줄은 p=0인 실행(45761332452, 45851769937, 예산 소진)의 줄도 S_next 후보로 셌다. 그래서 45757431002의 S_next는 05:24:10Z이고 그 R은 T와 같다.",
        "a의 소수 한 자리 반올림은 half-up(5794.35는 5794.4). 정확한 값은 JSON의 exact 필드. 점 판정은 반올림 전 분수로 계산.",
        "E의 두 읽기: (가) a_last를 낸 실행이 이미 구간 점이면 점 하나로 센다. (나) a_last를 구간 점과 별개의 점으로 더 센다. 어느 쪽이 맞는지 규칙 문장만으로는 정할 수 없어 둘 다 계산했다.",
    ],
}
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1, default=ser), encoding="utf-8")

# console summary
for iv in intervals:
    print(iv["run_id"], iv["S"].time(), "p=%d" % iv["p"], iv["counts"], "S_next=%s" % (iv["S_next"].time() if iv["S_next"] else None),
          "gap=%s" % iv.get("gap_s"), "dR=%s" % iv.get("dR"), "sumsnap=%s" % iv.get("sum_snap"),
          "a=%s" % iv.get("a"), "used" if iv["used"] else "EXCL " + "; ".join(iv["reasons"]))
print("a_last", {k: (v if not isinstance(v, (Fraction, datetime)) else str(v)) for k, v in (a_last or {}).items()})
print("T", T, "Nmax", Nmax, "x1.05", float(Fraction(105, 100) * Nmax) if Nmax else None)
print("reading_a", reading_a)
print("reading_b", reading_b)
