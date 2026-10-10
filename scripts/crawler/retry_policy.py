"""Shared conservative source-error policy; no network or side effects."""
import math
import random
import time
from email.utils import parsedate_to_datetime

def retry_after(headers, timestamp=None):
    value=headers.get('Retry-After') if headers else None
    if not value:
        return 0
    try:
        seconds=float(value)
    except (ValueError, TypeError):
        try:
            seconds=parsedate_to_datetime(value).timestamp()-(time.time() if timestamp is None else timestamp)
        except (ValueError, TypeError, OverflowError):
            return 0
    return min(604800,max(0,math.ceil(seconds))) if math.isfinite(seconds) else 0

def source_failure(error, attempts, timestamp=None, jitter=None):
    code=getattr(error,'code',None)
    hint=retry_after(getattr(error,'headers',None),timestamp)
    base=min(3600,30*2**min(attempts+1,8))
    fraction=random.random() if jitter is None else jitter
    delay=max(60,math.ceil(base*(0.5+0.5*fraction)),hint)
    category='http_'+str(code) if code else type(error).__name__
    if code==403:
        delay=max(86400,delay)
    elif code==429:
        delay=max(21600,delay)
    permanent=code in [404,410] or code is not None and 400<=code<500 and code not in [403,408,429]
    return dict(status='failed' if permanent or attempts>=2 else 'retry',
                error=category,retryAfterSeconds=delay,
                providerCooldownSeconds=delay if code in [403,429] or hint else 0,
                **({'providerWaitReason':'retry_after'} if hint and code not in [403,429] else {}))
