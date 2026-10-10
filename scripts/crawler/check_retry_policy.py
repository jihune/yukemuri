from retry_policy import retry_after,source_failure
from urllib.error import HTTPError
from datetime import datetime,timezone
from email.utils import format_datetime
stamp=datetime(2026,10,5,0,0,tzinfo=timezone.utc).timestamp()
assert retry_after({'Retry-After':'7200'},stamp)==7200
assert retry_after({'Retry-After':format_datetime(datetime.fromtimestamp(stamp+900,timezone.utc))},stamp)==900
assert retry_after({'Retry-After':'invalid'},stamp)==0
assert retry_after({'Retry-After':'nan'},stamp)==0
def error(code,headers=None):return HTTPError('https://example.com',code,'test',headers or {},None)
p=source_failure(error(429,{'Retry-After':'7200'}),0,stamp,jitter=0)
assert p['retryAfterSeconds']==21600 and p['providerCooldownSeconds']==21600 and p['status']=='retry'
for code,minimum in [(403,86400),(429,21600)]:
 p=source_failure(error(code),0,stamp,jitter=0)
 assert p['retryAfterSeconds']==minimum and p['providerCooldownSeconds']==minimum
 p=source_failure(error(code,{'Retry-After':'100000'}),0,stamp,jitter=0)
 assert p['retryAfterSeconds']==100000 and p['providerCooldownSeconds']==100000,'A longer provider wait must not be shortened'
assert source_failure(error(404),0,stamp)['status']=='failed'
assert source_failure(error(401),0,stamp)['status']=='failed'
assert source_failure(error(503,{'Retry-After':'900'}),0,stamp)['providerCooldownSeconds']==900
assert source_failure(TimeoutError(),2,stamp)['status']=='failed'
assert source_failure(TimeoutError(),1,stamp,jitter=0)['retryAfterSeconds']==60,'Connection errors use only a normal page retry'
assert source_failure(error(408),1,stamp,jitter=0)['retryAfterSeconds']<source_failure(error(408),1,stamp,jitter=1)['retryAfterSeconds']
assert source_failure(error(503),0,stamp,jitter=0)['providerCooldownSeconds']==0
assert source_failure(ValueError(),0,stamp,jitter=0)['providerCooldownSeconds']==0
assert source_failure(error(503,{'Retry-After':'900'}),0,stamp)['providerWaitReason']=='retry_after'
print('Retry-policy checks passed: seconds/date Retry-After, invalid values, 403/429 floors and ordinary page retries, longer provider waits, permanent errors, provider pause and bounded jitter.')
