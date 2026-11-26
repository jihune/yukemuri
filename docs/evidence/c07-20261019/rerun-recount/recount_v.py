# ruff: noqa: UP031  (a subagent's one-off recount; the code is kept as it ran)
"""Recount verdicts V1-V5, V7, V8 from three measurement reports (before, after, control).

Usage: python3 -I recount_v.py --before B.json --after A.json [--control C.json] --out OUT.json
Reads only the per-shape run records under runs.<shape>; the report's own 'verdicts' key is never read.
"""
import argparse
import json
import re
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

SHAPES = ["A", "B", "C", "B2", "C10", "C20"]
RE_JALAN_DETAIL = re.compile(r"^https://www\.jalan\.net/yad\d+/$")
RE_JALAN_LIST = re.compile(r"^https://www\.jalan\.net/ui/")
RE_TRIP_DETAIL = re.compile(r"^https://www\.trip\.com/hotels/[^/]*-hotel-detail-\d+/")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def fl(x, nd=6):
    return None if x is None else round(float(x), nd)


def dec3(fr):
    # Fraction -> string with 3 decimals, half-up
    d = (Decimal(fr.numerator) / Decimal(fr.denominator)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    return format(d, "f")


def kind_counts(urls):
    c = {"jalan_detail": 0, "jalan_list": 0, "trip_detail": 0, "other": 0}
    for u in urls:
        if RE_JALAN_DETAIL.match(u):
            c["jalan_detail"] += 1
        elif RE_JALAN_LIST.match(u):
            c["jalan_list"] += 1
        elif RE_TRIP_DETAIL.match(u):
            c["trip_detail"] += 1
        else:
            c["other"] += 1
    return c


def facts(run):
    pages = run["pages"]
    assert pages > 0
    groups_read = sum(g["read"] for g in run["groups"].values())
    return {
        "claimRead": run["claimRead"],
        "pages": pages,
        "claimRead_over_pages_raw": fl(Fraction(run["claimRead"], pages)),
        "claimReadPerPage_reported": run["claimReadPerPage"],
        "written": run["written"],
        "written_over_pages_raw": fl(Fraction(run["written"], pages)),
        "writtenPerPage_reported": run["writtenPerPage"],
        "savedJalanPending_len": len(run["savedJalanPending"]),
        "saved_len": len(run["saved"]),
        "candidatesAfter": run["candidatesAfter"],
        "groups_read_sum": groups_read,
        "claimRead_minus_groups_read_sum": run["claimRead"] - groups_read,
        "claimRead_equals_groups_read_sum": run["claimRead"] == groups_read,
        "saved_kind_counts": kind_counts(run["saved"]),
        "groups_pages": {k: g["pages"] for k, g in run["groups"].items()},
    }


def ratio_pair(b, a, raw_field_num, rounded_field):
    # raw: (a.num/a.pages)/(b.num/b.pages); rounded: reported per-page field after/before
    raw = (Fraction(a[raw_field_num], a["pages"])) / (Fraction(b[raw_field_num], b["pages"]))
    rnd = Fraction(a[rounded_field]) / Fraction(b[rounded_field])
    return raw, rnd


def prefix_check(before_list, after_list):
    """after must be a prefix of before (after may be shorter). Return (same, first_diff_index_or_None, detail)."""
    n = min(len(before_list), len(after_list))
    for i in range(n):
        if before_list[i] != after_list[i]:
            return False, i, {"before": before_list[i], "after": after_list[i]}
    if len(after_list) > len(before_list):
        return False, len(before_list), {"before": None, "after": after_list[len(before_list)]}
    return True, None, None


def analyze(before, after, control):
    out = {"per_shape": {}, "verdicts": {}}
    for s in SHAPES:
        rb, ra = before["runs"][s], after["runs"][s]
        out["per_shape"][s] = {"before": facts(rb), "after": facts(ra)}
        if control is not None:
            out["per_shape"][s]["control"] = facts(control["runs"][s])

    def r(s):
        return before["runs"][s], after["runs"][s]

    # V1 (C) and V7 (C10): claimRead per page, after over before, <= 0.5
    half = Fraction(1, 2)
    for key, shape, yes, no in (("V1", "C", "CUT", "NOT_CUT"), ("V7", "C10", "CUT10", "NOT_CUT10")):
        b, a = r(shape)
        raw, rnd = ratio_pair(b, a, "claimRead", "claimReadPerPage")
        v_raw = yes if raw <= half else no
        v_rnd = yes if rnd <= half else no
        out["verdicts"][key] = {
            "shape": shape,
            "verdict": v_raw,
            "ratio_raw": fl(raw),
            "ratio_raw_3dp": dec3(raw),
            "ratio_rounded_fields": fl(rnd),
            "verdict_rounded_fields": v_rnd,
            "methods_agree": v_raw == v_rnd,
            "before": {"claimRead": b["claimRead"], "pages": b["pages"], "claimReadPerPage": b["claimReadPerPage"]},
            "after": {"claimRead": a["claimRead"], "pages": a["pages"], "claimReadPerPage": a["claimReadPerPage"]},
        }

    # V2: pending Jalan detail pages saved, after is a prefix of before, every shape
    per = {}
    diff_shapes = []
    for s in SHAPES:
        b, a = r(s)
        same, idx, det = prefix_check(b["savedJalanPending"], a["savedJalanPending"])
        extra = {
            "before_len": len(b["savedJalanPending"]),
            "after_len": len(a["savedJalanPending"]),
            "after_is_prefix_of_before": same,
            "first_difference_index_0based": idx,
            "first_difference_detail": det,
            "before_has_duplicates": len(set(b["savedJalanPending"])) != len(b["savedJalanPending"]),
            "after_has_duplicates": len(set(a["savedJalanPending"])) != len(a["savedJalanPending"]),
            "after_set_subset_of_before_set": set(a["savedJalanPending"]) <= set(b["savedJalanPending"]),
            "vacuous_both_empty": len(b["savedJalanPending"]) == 0 and len(a["savedJalanPending"]) == 0,
            "saved_kind_counts_before": kind_counts(b["saved"]),
            "saved_kind_counts_after": kind_counts(a["saved"]),
            "groups_pages_before": {k: g["pages"] for k, g in b["groups"].items()},
            "groups_pages_after": {k: g["pages"] for k, g in a["groups"].items()},
        }
        per[s] = extra
        if not same:
            diff_shapes.append({"shape": s, "index_0based": idx, **(det or {})})
    out["verdicts"]["V2"] = {
        "verdict": "SAME_ORDER" if not diff_shapes else "DIFFERENT",
        "different_shapes": diff_shapes,
        "per_shape": per,
    }

    # V3: written per page, after over before, every shape, <= 1.1
    limit = Fraction(11, 10)
    rows = {}
    max_raw = (None, None)
    max_rnd = (None, None)
    for s in SHAPES:
        b, a = r(s)
        raw, rnd = ratio_pair(b, a, "written", "writtenPerPage")
        rows[s] = {
            "ratio_raw": fl(raw),
            "ratio_rounded_fields": fl(rnd),
            "written_before": b["written"],
            "written_after": a["written"],
            "pages_before": b["pages"],
            "pages_after": a["pages"],
            "writtenPerPage_before": b["writtenPerPage"],
            "writtenPerPage_after": a["writtenPerPage"],
            "raw_le_1.1": raw <= limit,
            "rounded_le_1.1": rnd <= limit,
        }
        if max_raw[0] is None or raw > max_raw[0]:
            max_raw = (raw, s)
        if max_rnd[0] is None or rnd > max_rnd[0]:
            max_rnd = (rnd, s)
    v3_raw = "OK" if max_raw[0] <= limit else "UP"
    v3_rnd = "OK" if max_rnd[0] <= limit else "UP"
    out["verdicts"]["V3"] = {
        "verdict": v3_raw,
        "max_ratio_raw": fl(max_raw[0]),
        "max_ratio_raw_shape": max_raw[1],
        "verdict_rounded_fields": v3_rnd,
        "max_ratio_rounded_fields": fl(max_rnd[0]),
        "max_ratio_rounded_shape": max_rnd[1],
        "methods_agree": v3_raw == v3_rnd,
        "per_shape": rows,
    }

    # V4: B2 candidatesAfter, after vs before; no more left -> KEEPS
    b, a = r("B2")
    out["verdicts"]["V4"] = {
        "verdict": "KEEPS" if a["candidatesAfter"] <= b["candidatesAfter"] else "LOSES",
        "candidatesAfter_before": b["candidatesAfter"],
        "candidatesAfter_after": a["candidatesAfter"],
        "candidatesBefore_before": b["candidatesBefore"],
        "candidatesBefore_after": a["candidatesBefore"],
    }

    # V5: control B2 leaves more done candidates than the fix does
    if control is None:
        out["verdicts"]["V5"] = {"verdict": "NO_CONTROL"}
    else:
        c = control["runs"]["B2"]
        fix = after["runs"]["B2"]
        out["verdicts"]["V5"] = {
            "verdict": "CONTROL_FAILS" if c["candidatesAfter"] > fix["candidatesAfter"] else "CONTROL_PASSES",
            "control_B2_candidatesAfter": c["candidatesAfter"],
            "after_B2_candidatesAfter": fix["candidatesAfter"],
            "control_B2_candidatesBefore": c["candidatesBefore"],
        }

    # V8: C20 ratio, no pass mark
    b, a = r("C20")
    raw, rnd = ratio_pair(b, a, "claimRead", "claimReadPerPage")
    out["verdicts"]["V8"] = {
        "shape": "C20",
        "ratio_raw": fl(raw),
        "ratio_raw_3dp": dec3(raw),
        "ratio_rounded_fields": fl(rnd),
        "ratio_rounded_fields_3dp": dec3(rnd),
        "methods_agree_at_3dp": dec3(raw) == dec3(rnd),
        "before": {"claimRead": b["claimRead"], "pages": b["pages"], "claimReadPerPage": b["claimReadPerPage"]},
        "after": {"claimRead": a["claimRead"], "pages": a["pages"], "claimReadPerPage": a["claimReadPerPage"]},
    }

    v = out["verdicts"]
    out["VERDICT"] = "VERDICT %s %s %s %s %s %s C20=%s" % (
        v["V1"]["verdict"], v["V2"]["verdict"], v["V3"]["verdict"], v["V4"]["verdict"],
        v["V5"]["verdict"], v["V7"]["verdict"], v["V8"]["ratio_raw_3dp"],
    )
    # does the rounded-field method give a different VERDICT line?
    out["VERDICT_rounded_fields"] = "VERDICT %s %s %s %s %s %s C20=%s" % (
        v["V1"]["verdict_rounded_fields"], v["V2"]["verdict"], v["V3"]["verdict_rounded_fields"],
        v["V4"]["verdict"], v["V5"]["verdict"], v["V7"]["verdict_rounded_fields"],
        v["V8"]["ratio_rounded_fields_3dp"],
    )
    return out


RULE_AMBIGUITIES = [
    "Per-page value: rules say rows per page saved; computed as claimRead/pages (raw) as primary. The reported rounded fields (claimReadPerPage, writtenPerPage) are computed in parallel as a second method; VERDICT uses raw.",
    "V2: 'the first ones of those saved before' read as: after list must equal before[:len(after)] (prefix). An after list longer than before counts as DIFFERENT (first difference at len(before)). Equal length with equal content is SAME_ORDER. 'Page kind' is not defined; counted by saved URL (jalan detail /yadN/, jalan list /ui/, trip detail hotel-detail) and by groups.<name>.pages.",
    "V4: 'No more left' read as after <= before (equal counts as KEEPS); candidatesAfter used as given (B2 includes 21 baseline candidates plus 25 B2 ones, total 46).",
    "V5: 'leaves more done candidates than the fix does' read as strictly greater; equal gives CONTROL_PASSES.",
    "V1/V7 '0.5 or less' and V3 '1.1 or less' read as inclusive (<=). Comparisons use exact Fractions, not floats.",
    "V3 'in every shape': verdict OK only if the maximum ratio over the six shapes is <= 1.1.",
    "V8 ratio: raw claimRead/pages ratio rounded half-up to 3 decimals.",
]


def control_set(before, control, dirpath, baseline):
    import glob
    import os
    res = {}
    for p in sorted(glob.glob(os.path.join(dirpath, "after_*.json"))):
        a = load(p)
        r = analyze(before, a, control)
        diff_keys = [k for k in ("V1", "V2", "V3", "V4", "V5", "V7", "V8") if r["verdicts"][k] != baseline["verdicts"][k]]
        res[os.path.basename(p)] = {
            "VERDICT": r["VERDICT"],
            "VERDICT_rounded_fields": r["VERDICT_rounded_fields"],
            "verdict_dict_changed_vs_baseline": diff_keys,
            "verdict_label_changed_vs_baseline": [
                k for k in ("V1", "V2", "V3", "V4", "V5", "V7") if r["verdicts"][k]["verdict"] != baseline["verdicts"][k]["verdict"]
            ] + (["V8"] if r["verdicts"]["V8"]["ratio_raw_3dp"] != baseline["verdicts"]["V8"]["ratio_raw_3dp"] else []),
        }
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", required=True)
    ap.add_argument("--after", required=True)
    ap.add_argument("--control", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--controls-dir", default=None)
    args = ap.parse_args()
    before, after = load(args.before), load(args.after)
    control = load(args.control) if args.control else None
    res = analyze(before, after, control)
    res["inputs"] = {"before": args.before, "after": args.after, "control": args.control}
    res["rule_ambiguities"] = RULE_AMBIGUITIES
    if args.controls_dir:
        res["control_set"] = control_set(before, control, args.controls_dir, res)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(res["VERDICT"])
    print(res["VERDICT_rounded_fields"])


if __name__ == "__main__":
    main()
