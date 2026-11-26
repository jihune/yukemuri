"""Make three altered copies of after.json under recount/control/ (original untouched).
a: shape C claimRead x2.5 (integer)
b: shape C savedJalanPending first two items swapped
c: shape B2 candidatesAfter + 1
"""
import copy
import json
import os

BASE = "/tmp/claude-0/-home-user-yukemuri/3c18ca60-fdac-532d-accc-71a368c9d1fc/scratchpad/pr2"
SRC = os.path.join(BASE, "after.json")
DST = os.path.join(BASE, "recount", "control")
os.makedirs(DST, exist_ok=True)

with open(SRC, encoding="utf-8") as f:
    orig = json.load(f)


def write(name, d):
    with open(os.path.join(DST, name), "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write("\n")


a = copy.deepcopy(orig)
old = a["runs"]["C"]["claimRead"]
assert (old * 5) % 2 == 0, "claimRead*2.5 is not an integer"
a["runs"]["C"]["claimRead"] = old * 5 // 2
write("after_a_claimRead_x2.5.json", a)

b = copy.deepcopy(orig)
lst = b["runs"]["C"]["savedJalanPending"]
assert lst[0] != lst[1]
lst[0], lst[1] = lst[1], lst[0]
write("after_b_swap_first_two.json", b)

c = copy.deepcopy(orig)
c["runs"]["B2"]["candidatesAfter"] += 1
write("after_c_B2_candidatesAfter_plus1.json", c)

print("C claimRead", old, "->", a["runs"]["C"]["claimRead"])
print("C savedJalanPending[0:2] original", orig["runs"]["C"]["savedJalanPending"][:2])
print("B2 candidatesAfter", orig["runs"]["B2"]["candidatesAfter"], "->", c["runs"]["B2"]["candidatesAfter"])
