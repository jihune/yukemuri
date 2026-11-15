"""Seeded-defect controls for the V01-1 assertions of scripts/crawler/check_gentle_claims.py (PageFailureChecks).

First the unchanged copy must pass with no failure. Then each control takes one handling out of the copy's
update-site.py (one exact text replacement; the old text must be there exactly once) and runs the check. A control
holds when the check exits non-zero and its "expect" text, the message of the assertion that should notice, is in
the assertion failures the check printed. Any other outcome (a pass, or a failure whose output lacks the text)
is reported as DOES NOT HOLD. The file is put back afterwards.

usage: python3 controls_gentle_claims.py <copy with scripts/crawler/ and data/prefectures.json> <results file> [id ...]
The last line printed counts the controls that hold and the unchanged copy's failures.
"""
import re
import subprocess
import sys
import time
from pathlib import Path

copy, results = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
CHECK = ['python3', 'scripts/crawler/check_gentle_claims.py']
TARGET = copy / 'scripts/crawler/update-site.py'
ENDS = "a page the parser cannot read fails that page, not the run"
REFUSED = "a page the Site refuses fails that page, not the run"
NEXT = "the very next request reports that page failed under the same address"
THIRD = "the third page ends the run"
TWO = "two, a good page, two is never three in a row"
NOWAIT = "the collector's own failure puts no wait on the provider"
FALLBACK = "payload=dict(url=url,observations=[],links=[],claimToken=job['lease_token'],**contract_failure(name,job['attempts']))"
STOP = ("   unexpected[provider]=unexpected.get(provider,0)+1 if bug else 0\n"
        "   if unexpected[provider]>=UNEXPECTED_IN_A_ROW:raise RuntimeError(f'{unexpected[provider]} {provider} pages in a row failed on collector or Site contract errors; the run stops so the cause shows')\n")
STOP_GLOBAL = ("   unexpected['all']=unexpected.get('all',0)+1 if bug else 0\n"
               "   if unexpected['all']>=UNEXPECTED_IN_A_ROW:raise RuntimeError(f\"{unexpected['all']} {provider} pages in a row failed on collector or Site contract errors; the run stops so the cause shows\")\n")
CONTROLS = [
    # id, rule taken out, old text, new text, expect
    ('A1', 'the page-level except takes any exception', "   except Exception as error:", "   except (urllib.error.URLError,TimeoutError,ValueError,OSError) as error:", ENDS),
    ('A2', 'the log names the exception and the stage of a collector exception', "    if bug or isinstance(error,ValueError) and stage!='source_request':", "    if isinstance(error,ValueError) and stage!='source_request':", "the log names the exception and the stage"),
    ('A3', 'a collector exception counts toward the pages in a row', "bug=not isinstance(error,(urllib.error.URLError,TimeoutError,ValueError,OSError))", "bug=False", "three unsupported addresses in a row end the run"),
    ('B1', 'a 413 is reported as a page failure', "if error.code not in [400,413] or", "if error.code not in [400] or", REFUSED),
    ('B2', 'a refused data PUT is reported as a page failure', "if error.code not in [400,413] or payload['status'] not in ['done','skipped']:raise", "raise", REFUSED),
    ('B3', 'a 403 on the data PUT still ends the run', "if error.code not in [400,413] or", "if False or", "a 403 on a data PUT ends the run as before"),
    ('B4', 'a refused failure report still ends the run', " or payload['status'] not in ['done','skipped']:raise", ":raise", "the failure is reported once, not again"),
    ('C1', 'three pages in a row end the run', "UNEXPECTED_IN_A_ROW=3", "UNEXPECTED_IN_A_ROW=10**9", THIRD),
    ('C2', 'two pages in a row do not end the run', "UNEXPECTED_IN_A_ROW=3", "UNEXPECTED_IN_A_ROW=2", TWO),
    ('C3', 'a page read normally starts the count again', "unexpected[provider]=unexpected.get(provider,0)+1 if bug else 0", "unexpected[provider]=unexpected.get(provider,0)+(1 if bug else 0)", TWO),
    ('C4', 'the count is per provider', STOP, STOP_GLOBAL, "two pages from each provider are not three in a row from one"),
    ('D1', 'the failure name is no HTTP status name', "return dict(status=policy['status'],error=name,", "return dict(status=policy['status'],error='http_'+name,", NEXT),
    ('D2', 'the Site-contract failure puts no wait on the provider', "retryAfterSeconds=policy['retryAfterSeconds'])", "retryAfterSeconds=policy['retryAfterSeconds'],providerCooldownSeconds=120)", NOWAIT),
    ('D3', 'the Site-contract failure follows the attempts (third is failed)', "policy=source_failure(RuntimeError(name),attempts)", "policy=source_failure(RuntimeError(name),0)", NEXT),
    ('D4', 'an unsupported queue address is failed at once', "contract_failure('queue_url_unsupported',2)", "contract_failure('queue_url_unsupported',0)", "it cannot become supported, so no retries"),
    ('D5', 'a collector exception puts no wait on the provider', "cooldown=policy.pop('providerCooldownSeconds',0)", "cooldown=policy.pop('providerCooldownSeconds',0) or 120", NOWAIT),
    ('E1', 'an unsupported queue address is reported failed', "    if unsupported:stage='queue_url';raise QueueUrlUnsupported('Queue contained an unsupported URL')", "    pass", "it cannot become supported, so no retries"),
    ('E2', 'the source is not asked for an unsupported queue address', "    if unsupported:stage='queue_url';raise QueueUrlUnsupported('Queue contained an unsupported URL')", "    if unsupported:stage='queue_url';guard.open(source_request_url(url,kind));raise QueueUrlUnsupported('Queue contained an unsupported URL')", "the source is not asked for an address the collector does not support"),
    ('F1', 'the failure report carries the claim token', FALLBACK, "payload=dict(url=url,observations=[],links=[],**contract_failure(name,job['attempts']))", "is reported with the claim it holds"),
    ('G1', 'the failure report leaves the refused data out', FALLBACK, "payload=dict(payload,claimToken=job['lease_token'],**contract_failure(name,job['attempts']))", "a failed page reports no data"),
    ('H1', 'a refused data PUT counts toward the pages in a row', "bug=True;name=f'site_contract_{error.code}'", "name=f'site_contract_{error.code}'", THIRD),
]
wanted = sys.argv[3:] or [c[0] for c in CONTROLS]


def run():
    r = subprocess.run(CHECK, cwd=copy, capture_output=True, text=True, encoding='utf-8', errors='replace', check=False)
    return r.returncode, r.stdout + r.stderr


def verdict(code, output):
    ran = re.search(r'Ran (\d+) tests?', output)
    bad = re.search(r'FAILED \((.*?)\)', output)
    return f"{'PASS' if code == 0 and 'OK' in output.splitlines()[-1:] else 'FAIL'} tests={ran[1] if ran else '?'} {bad[1] if bad else 'failures=0'} rc={code}"


def log(line):
    with results.open('a', encoding='utf-8') as out:
        out.write(line + '\n')
    print(line, flush=True)


def now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


original = TARGET.read_text(encoding='utf-8')
code, output = run()
unchanged = verdict(code, output)
log(f'{now()}\tunchanged copy\t{unchanged}')
held = 0
for cid, rule, old, new, expect in [c for c in CONTROLS if c[0] in wanted]:
    assert original.count(old) == 1, cid + ': the handling text is not there exactly once'
    try:
        TARGET.write_text(original.replace(old, new), encoding='utf-8')
        code, output = run()
    finally:
        TARGET.write_text(original, encoding='utf-8')
    failures = output[output.index('AssertionError'):] if 'AssertionError' in output else ''
    ok = code != 0 and expect in failures
    held += ok
    log('\t'.join([now(), cid, 'HOLDS' if ok else 'DOES NOT HOLD', verdict(code, output), '"' + expect + '"', rule]))
assert TARGET.read_text(encoding='utf-8') == original
log(f"SUMMARY controls_held={held} of {len(wanted)}; unchanged copy: {unchanged}")
