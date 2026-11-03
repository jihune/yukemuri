# C07 baths claim fix: the Jalan baths claim stops taking pending detail jobs (the
# Jalan detail claim takes them in the same order), so a run asks it once when no
# done page needs bath data v3 again, instead of every round. This compares one
# gentle run of 120 pages per queue shape before and after the fix, from the reports
# of measure-claim-groups.mjs run on two Worker builds (--server).
# Usage: python3 -I docs/evidence/c07-20261019/compare-baths-fix.py <before.json> <after.json> [<control.json>]
# <control.json>: a build whose baths claim takes no done page at all (the check can
# fail: it must leave the done candidates of shape B2 untouched).
#
# Verdict rules, written and committed before the first run (counting-discipline,
# harness 067575b). The last line printed is "VERDICT <V1> <V2> <V3> <V4> <V5>".
# V1 reads: rows all claims read per page saved, after over before, in shape C
#    (11-02, done Jalan pages 7,802). 0.5 or less CUT, otherwise NOT_CUT.
# V2 order: in every shape, the pending Jalan detail pages the fix saves, in save
#    order, are the first ones of those saved before (the same choices in the same
#    order; within 120 pages the fix may save fewer of them, since the baths claim no
#    longer adds one each round and other groups fill the cap). SAME_ORDER, otherwise
#    DIFFERENT (the shapes and the first difference are listed). The count of each
#    page kind before and after is reported, without a threshold.
# V3 writes: rows all requests wrote per page saved, after over before, in every
#    shape. 1.1 or less OK, otherwise UP.
# V4 backfill: in shape B2 (25 done Jalan hotels whose bath data is not v3), the done
#    candidates left after the run, after against before. No more left: KEEPS,
#    otherwise LOSES.
# V5 control: with <control.json>, its shape B2 leaves more done candidates than the
#    fix does: CONTROL_FAILS (V4 can fail); otherwise CONTROL_PASSES (V4 proves
#    nothing). Without it: NO_CONTROL.
