# C07 plans 2 and 5: what a UTC day of gentle collection read after plan 2 (#246,
# merged 2026-10-28T00:1xZ), from the GitHub Actions logs of that day.
# Usage: python3 -I docs/evidence/c07-20261019/day-measure.py <logs dir> > day-measure.json
# <logs dir> holds manifest.json and the job logs it names (collect.yml collect
# and snapshot jobs, usage.yml daily checks, deploy.yml and lifecycle.yml jobs).
#
# Verdict rules, written and committed before the first run on the logs
# (counting-discipline, harness 067575b). The numbers are not changed after.
# The last line printed to stderr is "VERDICT <C1> <C2> <C4> <C4-trip> <C4-lag> <C5> <P5>".
#
# C1 no count at the end of a run: every collect log since plan 2 that prints the
#    collector's {"processed": N, ...} line prints it without "coverage".
#    PASS when at least one such line exists and none has "coverage"; FAIL when one
#    has it; NONE when no line exists. Self-test first: a synthetic line with
#    "coverage" must count as one, a line without must not (else ERROR).
# C2 the deploy stores the run's count: every collect run whose snapshot job ran
#    record-coverage.mjs has exactly one {"recordedCoverage": {"day": D, ...}} line
#    and D is the UTC date its collect job completed. PASS / FAIL (list the runs).
# C3 the day (descriptive, no threshold): pages (done + retry + failed page lines),
#    the sum of pages= lines, snapshot builds ("Search snapshot <id>: ... rows
#    read") by count and rows, the day's account reads from the next day's daily
#    check, the snapshots' share of those reads and of the 5,000,000 free limit,
#    and reads per page. Compared with 2026-10-27 (1,035 pages, 9 snapshots
#    1,421,397 rows, 4,449,868 reads, 89.0%).
# C4 a run's own reads per page after plan 2 against plan 1 (B and C intervals,
#    2,276 and 2,215 rows per page, mean 2,245.5):
#    - span: from the first Size line of the day to the first Size line after the
#      last run that collected pages, when that Size line is before 19:00Z (the
#      runner's backup, 19:23Z, may follow); otherwise to the last run's own Size
#      line, without its pages. Reads in the span are the difference of the two
#      Size lines less every snapshot build that started in the span (collect,
#      push and lifecycle deploys). Pages are those of the runs whose Size line
#      starts the span or falls inside it, except the one that ends it.
#      A lag of the analytics only moves reads between neighbouring intervals, so
#      the span's sum is not changed by it except at its two ends.
#    - LOWER when every measured day's span gives fewer than 2,245.5 rows per page,
#      NOT_LOWER when every day gives 2,245.5 or more, MIXED otherwise.
#    - intervals: the same subtraction between neighbouring Size lines, each
#      listed with its Trip.com pages. C4-trip: TRIP_NOT_CAUSE when the median of
#      intervals with no Trip.com page is 2,245.5 or more rows per page,
#      TRIP_POSSIBLE when it is below and the median of intervals with Trip.com
#      pages is 2,245.5 or more, UNDECIDED otherwise (fewer than 3 intervals in
#      a group counts as UNDECIDED).
#      C4-lag: LAG_NOT_CAUSE when C4 is NOT_LOWER (the span is lag-robust),
#      LAG_POSSIBLE when C4 is LOWER and some single interval is 2,245.5 or more,
#      UNDECIDED otherwise.
# C5 the 90% line (cloudflare-free-tier section 5): per day, reads inside the
#    collection budget (up to its last Size line that allowed pages) and outside
#    it (everything after: the backup and any deploy). Outside is the day's reads
#    less the last Size line that allowed pages, less that run's own share
#    (its interval if measured, else the day's median interval) and its snapshot.
#    BELOW when 0.85 x 5,000,000 plus the largest day's outside reads is under
#    4,500,000 rows (90%), OVER otherwise.
# P5 plan 5 (defer the snapshot of runs the chain follows), assumption grid
#    before recommending (counting-discipline, harness 1d8809f):
#    - gained pages a day = (snapshots a day - snapshots under the option) x rows
#      per snapshot / rows per page. Options: every third run (ceil(n/3) builds,
#      the chain's last run included) and only the chain's last run (1 build for
#      the day's chain, plus 1 for a runner run before the chain opens).
#    - grid: rows per snapshot {146,500, 160,000, 180,000}; rows per page {the
#      lowest and highest day span of C4, 2,245.5}; snapshots a day {the lowest
#      and highest measured day}.
#    - WORTH_ASKING when every-third-run gains at least 10% of the lowest measured
#      day's pages in every grid cell, CONDITIONAL when only in some cells (the
#      cells are listed), NOT_WORTH when in none.
#    - backlog: the pending count of the first and last recordedCoverage line of
#      each day; when it falls by more than a seventh of itself a day, the gain is
#      short-lived and P5 is reported as NOT_WORTH whatever the grid says.
