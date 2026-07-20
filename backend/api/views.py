import logging
import random
import re
import time
import uuid
import csv
import threading
from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.http import HttpResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from concurrent.futures import ThreadPoolExecutor
from .models import User, CreditLog, Campaign
logger = logging.getLogger(__name__)

USERNAME = "APIDEMO"

# 🔥 Jitne tokens utne numbers se parallel send hoga
# NOTE: move these to environment variables / Django settings in production
# (e.g. os.environ["CHATWAY_TOKENS"].split(",")) instead of hardcoding secrets in code.
TOKENS = [
"aDl4RzQ0bG5Cc3liOUZvYkhyUG1HUT09",
"SnNmbFphVTJkUllFYVBmOWtkbjd1Zz09",
"T20rUUJYc3NiOUZjUlVIT1BBajUyQT09",
"a2RaTXNkRUlXT0hVZ0NVNjZwSTlxUT09",
"bHVjM3VraHg1WlUwMDhCa2pQNHA2QT09",
"Um1KbnhWS0FKQVRBclZlZUhUbUFnQT09",
"Y1pROG1QM0dDQkxUcEhEajJ0OFZzUT09",
]
TOKEN_COUNT = len(TOKENS)

# 🔥 BATCH ROTATION — ek token se BATCH_SIZE_PER_TOKEN messages jayenge,
# phir agla token use hoga. Isse ek number pe kam load padta hai (ban-risk kam).
BATCH_SIZE_PER_TOKEN = 3

MAX_WORKERS_TEXT = 20   # per-token concurrency for text-only sends
MAX_WORKERS_FILE  = 10  # per-token concurrency for sends that include a file
MAX_WORKERS_UPLOAD = 6  # concurrency for parallel file uploads (images/video/pdf)

TEXT_POOL_SIZE = TOKEN_COUNT * MAX_WORKERS_TEXT   # 140
FILE_POOL_SIZE = TOKEN_COUNT * MAX_WORKERS_FILE   # 70

NUMBER_RE = re.compile(r"91\d{10}")

# ─────────────────────────────────────────
# 🔥 SHARED HTTP SESSION — connection pooling = much faster bulk sends
# ─────────────────────────────────────────
_session = requests.Session()
_retry_policy = Retry(
    total=1,
    connect=1,
    read=0,
    backoff_factor=0.15,
    status_forcelist=[500, 502, 503, 504],
)
_adapter = HTTPAdapter(
    pool_connections=20,
    pool_maxsize=TEXT_POOL_SIZE + FILE_POOL_SIZE,
    max_retries=_retry_policy,
    pool_block=False,
)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)

# ─────────────────────────────────────────
# 🔥 PERSISTENT GLOBAL THREAD POOLS
# ─────────────────────────────────────────
TEXT_EXECUTOR = ThreadPoolExecutor(max_workers=TEXT_POOL_SIZE, thread_name_prefix="wapp-text")
FILE_EXECUTOR = ThreadPoolExecutor(max_workers=FILE_POOL_SIZE, thread_name_prefix="wapp-file")
UPLOAD_EXECUTOR = ThreadPoolExecutor(max_workers=MAX_WORKERS_UPLOAD, thread_name_prefix="wapp-upload")

TEXT_TIMEOUT = (3, 5)    # (connect, read)
FILE_TIMEOUT = (3, 8)
ADMIN_TIMEOUT = (3, 4)


def batch_token_index(position):
    """🔥 3-per-token batching: position 0,1,2 → token0 | 3,4,5 → token1 | ..."""
    return (position // BATCH_SIZE_PER_TOKEN) % TOKEN_COUNT


# ═════════════════════════════════════════════════════════════════════════
# 🩺 TOKEN HEALTH / CIRCUIT BREAKER
# A token that keeps failing gets put on cooldown so future sends skip
# straight to a healthy token instead of wasting a timeout on it.
# ═════════════════════════════════════════════════════════════════════════
TOKEN_FAIL_THRESHOLD  = 3
TOKEN_COOLDOWN_SECONDS = 60

_token_health_lock    = threading.Lock()
_token_fail_count     = {i: 0 for i in range(TOKEN_COUNT)}
_token_cooldown_until = {i: 0 for i in range(TOKEN_COUNT)}


def _mark_token_result(idx, ok):
    with _token_health_lock:
        if ok:
            _token_fail_count[idx] = 0
            _token_cooldown_until[idx] = 0
        else:
            _token_fail_count[idx] = _token_fail_count.get(idx, 0) + 1
            if _token_fail_count[idx] >= TOKEN_FAIL_THRESHOLD:
                _token_cooldown_until[idx] = time.time() + TOKEN_COOLDOWN_SECONDS


def _token_order(token_index):
    """Healthy tokens first (rotated from token_index), cooling-down tokens last."""
    now = time.time()
    with _token_health_lock:
        healthy = [i for i in range(TOKEN_COUNT) if _token_cooldown_until.get(i, 0) <= now]
        cooling = [i for i in range(TOKEN_COUNT) if _token_cooldown_until.get(i, 0) > now]
    if not healthy:
        healthy, cooling = list(range(TOKEN_COUNT)), []
    start = token_index % len(healthy)
    return healthy[start:] + healthy[:start] + cooling


# ═════════════════════════════════════════════════════════════════════════
# 📊 LIVE PROGRESS TRACKER
# ═════════════════════════════════════════════════════════════════════════
_progress_lock  = threading.Lock()
_progress_store = {}


def _init_progress(job_id, total):
    with _progress_lock:
        _progress_store[job_id] = {
            "total": total, "done": 0,
            "success": 0, "failed": 0, "nonwa": 0, "rejected": 0,
        }


def _bump_progress(job_id, status):
    if not job_id:
        return
    with _progress_lock:
        p = _progress_store.get(job_id)
        if p is None:
            return
        p["done"] += 1
        p[status] = p.get(status, 0) + 1


def _clear_progress(job_id):
    with _progress_lock:
        _progress_store.pop(job_id, None)


@api_view(['GET'])
def campaign_progress(request):
    job_id = request.query_params.get("job_id")
    with _progress_lock:
        p = _progress_store.get(job_id)
    if not p:
        return Response({"status": "failed", "message": "No active job (finished already or invalid id)"})
    return Response({"status": "success", **p})


def _personalize(message, number):
    if not message:
        return message
    return message.replace("{number}", number)


# ═════════════════════════════════════════════════════════════════════════
# 🔒 CREDIT HELPERS
# ═════════════════════════════════════════════════════════════════════════

def reserve_credit(user_id, amount, description):
    """
    Locks the user row and atomically deducts `amount` credits up-front.
    Admins are unlimited and always pass without being charged.
    Policy: this deduction is FINAL — success, failed, nonwa, or rejected,
    the credit is never refunded (see refund_credit below, kept only for
    the cancel-before-send case where nothing was ever attempted).
    """
    try:
        with transaction.atomic():
            user = User.objects.select_for_update().get(id=user_id)

            if user.is_admin():
                return True, None, "unlimited", user

            if amount <= 0:
                return True, None, user.credit, user

            if user.credit < amount:
                return False, f"Insufficient credits. You have {user.credit}, need {amount}", user.credit, user

            user.credit -= amount
            user.save(update_fields=["credit"])

            CreditLog.objects.create(
                from_user=user, to_user=None, action="debit",
                amount=amount, description=description,
            )
            return True, None, user.credit, user

    except User.DoesNotExist:
        return False, "User not found", 0, None


def refund_credit(user_id, amount, description):
    """
    Only used for CANCEL of a still-pending campaign (no send attempted
    at all). NOT used anywhere in the actual send/complete flow anymore —
    success, failed, nonwa, rejected are all final deductions, no refund.
    """
    if amount is None or amount <= 0:
        return

    try:
        with transaction.atomic():
            user = User.objects.select_for_update().get(id=user_id)
            if user.is_admin():
                return
            user.credit += amount
            user.save(update_fields=["credit"])
            CreditLog.objects.create(
                from_user=None, to_user=user, action="credit",
                amount=amount, description=description,
            )
    except User.DoesNotExist:
        logger.error("refund_credit: user %s not found while refunding %s", user_id, amount)


@api_view(['GET'])
def health_check(request):
    return Response({"status": "ok"})

# ─────────────────────────────────────────
# LOGIN
# ─────────────────────────────────────────
@api_view(['POST'])
def login(request):
    try:
        username = request.data.get("username")
        password = request.data.get("password")
        user = User.objects.filter(username=username, password=password).first()

        if not user:
            return Response({"status": "failed", "message": "Invalid username or password ❌"})
        if user.status != "Active":
            return Response({"status": "failed", "message": "Account is deactivated ❌"})

        return Response({
            "status":   "success",
            "user_id":  user.id,
            "username": user.username,
            "role":     user.role,
            "credit":   user.credit,
        })
    except Exception as e:
        logger.exception("login error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# CREATE USER
# ─────────────────────────────────────────
@api_view(['POST'])
def create_user(request):
    try:
        creator_id = request.data.get("creator_id")
        username   = request.data.get("username")
        password   = request.data.get("password")
        role       = request.data.get("role", "user")
        credit     = int(request.data.get("credit", 0))

        if not username or not password:
            return Response({"status": "failed", "message": "Username & password required"})

        if User.objects.filter(username=username).exists():
            return Response({"status": "failed", "message": "Username already exists"})

        with transaction.atomic():
            creator = User.objects.select_for_update().get(id=creator_id)

            if creator.role == "user":
                return Response({"status": "failed", "message": "Users cannot create accounts"})
            if creator.role == "reseller" and role == "admin":
                return Response({"status": "failed", "message": "Reseller cannot create admin"})

            if credit > 0 and not creator.is_admin() and creator.credit < credit:
                return Response({
                    "status":  "failed",
                    "message": f"Insufficient credits. You have {creator.credit}"
                })

            new_user = User.objects.create(
                username=username, password=password,
                role=role, credit=credit, parent=creator, status="Active"
            )

            if credit > 0 and not creator.is_admin():
                creator.credit -= credit
                creator.save(update_fields=["credit"])

            if credit > 0:
                CreditLog.objects.create(
                    from_user=creator, to_user=new_user, action="credit", amount=credit,
                    description=f"Initial credit on account creation by {creator.username}"
                )

        return Response({
            "status":      "success",
            "message":     f"{role.capitalize()} '{username}' created successfully",
            "user_id":     new_user.id,
            "username":    new_user.username,
            "role":        new_user.role,
            "credit":      new_user.credit,
            "your_credit": "unlimited" if creator.is_admin() else creator.credit,
        })

    except User.DoesNotExist:
        return Response({"status": "failed", "message": "Creator not found"})
    except Exception as e:
        logger.exception("create_user error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# CAMPAIGN RESULTS
# ─────────────────────────────────────────
@api_view(['GET'])
def campaign_results(request):
    try:
        campaign_id = request.query_params.get("campaign_id")
        campaign = Campaign.objects.get(id=campaign_id)
        return Response({"status": "success", "results": campaign.results})
    except Campaign.DoesNotExist:
        return Response({"status": "failed", "message": "Campaign not found"})
    except Exception as e:
        logger.exception("campaign_results error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# 📄 CAMPAIGN RESULTS — CSV EXPORT
# ─────────────────────────────────────────
@api_view(['GET'])
def campaign_results_csv(request):
    try:
        campaign_id = request.query_params.get("campaign_id")
        campaign = Campaign.objects.get(id=campaign_id)

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="campaign_{campaign_id}_results.csv"'
        writer = csv.writer(response)
        writer.writerow(["Number", "Status"])
        for row in (campaign.results or []):
            writer.writerow([row.get("number", ""), row.get("status", "")])
        return response

    except Campaign.DoesNotExist:
        return Response({"status": "failed", "message": "Campaign not found"})
    except Exception as e:
        logger.exception("campaign_results_csv error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# MY CAMPAIGNS LIST
# ─────────────────────────────────────────
@api_view(['GET'])
def my_campaigns(request):
    auto_complete_pending_campaigns()

    try:
        user_id = request.query_params.get("user_id")
        user = User.objects.get(id=user_id)

        if user.is_admin():
            campaigns = Campaign.objects.select_related("user").order_by("-created_at")[:500]
        else:
            campaigns = Campaign.objects.filter(user=user).order_by("-created_at")[:200]

        data = [{
            "id":            c.id,
            "name":          c.campaign_name,
            "message":       c.message,
            "total":         c.total,
            "success":       c.success,
            "failed":        c.failed,
            "nonwa":         c.nonwa,
            "rejected":      c.rejected,
            "status":        c.status,
            "file_urls":     c.file_urls,
            "date":          c.created_at.strftime("%d-%m-%Y %H:%M"),
            "rawDate":       int(c.created_at.timestamp() * 1000),
            "numberResults": c.results,
            "numberList":    c.number_list,
        } for c in campaigns]

        return Response({"status": "success", "campaigns": data})

    except User.DoesNotExist:
        return Response({"status": "failed", "message": "User not found"})
    except Exception as e:
        logger.exception("my_campaigns error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# CAMPAIGN COMPLETION — shared by the auto-completer and the manual
# "complete now" admin action.
# Policy: NO REFUNDS. Full amount was already reserved when the campaign
# was created — success or fail, it stays deducted.
# ─────────────────────────────────────────
def _simulate_and_close_campaign(campaign):
    success_pct       = random.uniform(0.80, 0.90)
    simulated_success = int(campaign.total * success_pct)
    simulated_failed  = campaign.total - simulated_success

    number_results = []
    numbers_saved  = campaign.number_list or []
    for i, num in enumerate(numbers_saved):
        number_results.append({
            "number": num,
            "status": "success" if i < simulated_success else "failed",
        })

    campaign.status  = "completed"
    campaign.success = simulated_success
    campaign.failed  = simulated_failed
    campaign.results = number_results
    campaign.save(update_fields=["status", "success", "failed", "results"])

    # 🚫 No refund — credit already reserved in full, stays deducted regardless of outcome.

    return simulated_success, simulated_failed


# ─────────────────────────────────────────
# AUTO COMPLETE PENDING CAMPAIGNS
# ─────────────────────────────────────────
def auto_complete_pending_campaigns():
    try:
        now      = timezone.now()
        pendings = Campaign.objects.filter(status="pending", complete_at__lte=now)
        for campaign in pendings:
            _simulate_and_close_campaign(campaign)
    except Exception as e:
        logger.exception("auto_complete_pending_campaigns error: %s", e)


# ─────────────────────────────────────────
# COMPLETE CAMPAIGN (Manual by Admin)
# ─────────────────────────────────────────
@api_view(['POST'])
def complete_campaign(request):
    try:
        campaign_id = request.data.get("campaign_id")
        campaign = Campaign.objects.get(id=campaign_id)

        if campaign.status == "completed":
            return Response({"status": "failed", "message": "Already completed"})

        simulated_success, simulated_failed = _simulate_and_close_campaign(campaign)

        return Response({
            "status":  "success",
            "message": f"Campaign completed. Success: {simulated_success}, Failed: {simulated_failed}",
        })

    except Campaign.DoesNotExist:
        return Response({"status": "failed", "message": "Campaign not found"})
    except Exception as e:
        logger.exception("complete_campaign error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# ❌ CANCEL PENDING CAMPAIGN
# (Refund kept HERE ONLY — nothing was ever sent/attempted for a still-
# queued campaign, so this is not a "result refund", it's an un-charge
# for numbers that never left the queue. Tell me if you want this
# removed too and I'll make cancellation non-refundable as well.)
# ─────────────────────────────────────────
@api_view(['POST'])
def cancel_campaign(request):
    try:
        campaign_id = request.data.get("campaign_id")
        campaign = Campaign.objects.get(id=campaign_id)

        if campaign.status != "pending":
            return Response({"status": "failed", "message": "Only pending campaigns can be cancelled"})

        refund_credit(
            campaign.user_id, campaign.total,
            f"Campaign '{campaign.campaign_name}' cancelled — full refund of {campaign.total}"
        )
        campaign.status = "cancelled"
        campaign.save(update_fields=["status"])

        return Response({"status": "success", "message": "Campaign cancelled and credits refunded"})

    except Campaign.DoesNotExist:
        return Response({"status": "failed", "message": "Campaign not found"})
    except Exception as e:
        logger.exception("cancel_campaign error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# ADD CREDIT
# ─────────────────────────────────────────
@api_view(['POST'])
def add_credit(request):
    try:
        from_id = request.data.get("from_id")
        to_id   = request.data.get("to_id")
        amount  = int(request.data.get("amount", 0))

        if amount <= 0:
            return Response({"status": "failed", "message": "Amount must be > 0"})

        with transaction.atomic():
            first_id, second_id = sorted([int(from_id), int(to_id)])
            locked = {u.id: u for u in User.objects.select_for_update().filter(id__in=[first_id, second_id])}
            from_user = locked.get(int(from_id))
            to_user   = locked.get(int(to_id))

            if not from_user or not to_user:
                return Response({"status": "failed", "message": "User not found"})

            if not from_user.is_admin() and from_user.credit < amount:
                return Response({
                    "status":  "failed",
                    "message": f"Insufficient credits. You have {from_user.credit}"
                })

            if not from_user.is_admin():
                from_user.credit -= amount
                from_user.save(update_fields=["credit"])
            to_user.credit += amount
            to_user.save(update_fields=["credit"])

            CreditLog.objects.create(
                from_user=from_user, to_user=to_user, action="credit", amount=amount,
                description=f"Credit added by {from_user.username}"
            )

            return Response({
                "status":          "success",
                "message":         f"{amount} credits added to {to_user.username}",
                "your_credit":     "unlimited" if from_user.is_admin() else from_user.credit,
                "receiver_credit": to_user.credit,
            })

    except User.DoesNotExist:
        return Response({"status": "failed", "message": "User not found"})
    except Exception as e:
        logger.exception("add_credit error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# DEDUCT CREDIT
# ─────────────────────────────────────────
@api_view(['POST'])
def deduct_credit(request):
    try:
        from_id = request.data.get("from_id")
        to_id   = request.data.get("to_id")
        amount  = int(request.data.get("amount", 0))

        if amount <= 0:
            return Response({"status": "failed", "message": "Amount must be > 0"})

        with transaction.atomic():
            first_id, second_id = sorted([int(from_id), int(to_id)])
            locked = {u.id: u for u in User.objects.select_for_update().filter(id__in=[first_id, second_id])}
            from_user = locked.get(int(from_id))
            to_user   = locked.get(int(to_id))

            if not from_user or not to_user:
                return Response({"status": "failed", "message": "User not found"})

            if not from_user.is_admin() and to_user.parent_id != from_user.id:
                return Response({"status": "failed", "message": "Not authorized"})

            if to_user.credit < amount:
                return Response({
                    "status":  "failed",
                    "message": f"{to_user.username} has only {to_user.credit} credits"
                })

            to_user.credit -= amount
            to_user.save(update_fields=["credit"])
            if not from_user.is_admin():
                from_user.credit += amount
                from_user.save(update_fields=["credit"])

            CreditLog.objects.create(
                from_user=from_user, to_user=to_user, action="debit", amount=amount,
                description=f"Credit deducted by {from_user.username}"
            )

            return Response({
                "status":        "success",
                "message":       f"{amount} credits deducted from {to_user.username}",
                "your_credit":   "unlimited" if from_user.is_admin() else from_user.credit,
                "target_credit": to_user.credit,
            })

    except User.DoesNotExist:
        return Response({"status": "failed", "message": "User not found"})
    except Exception as e:
        logger.exception("deduct_credit error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# GET MY USERS
# ─────────────────────────────────────────
@api_view(['GET'])
def get_my_users(request):
    try:
        user_id = request.query_params.get("user_id")
        user    = User.objects.get(id=user_id)

        if user.is_admin():
            users = User.objects.exclude(id=user.id).select_related("parent").order_by("-created_at")
        else:
            users = User.objects.filter(parent=user).select_related("parent").order_by("-created_at")

        data = [{
            "id":         u.id,
            "username":   u.username,
            "role":       u.role,
            "credit":     u.credit,
            "status":     u.status,
            "parent":     u.parent.username if u.parent else "Admin",
            "created_at": u.created_at.strftime("%d-%m-%Y"),
            "sub_count":  u.children.count(),
        } for u in users]

        return Response({"status": "success", "users": data})

    except User.DoesNotExist:
        return Response({"status": "failed", "message": "User not found"})
    except Exception as e:
        logger.exception("get_my_users error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# CREDIT HISTORY
# ─────────────────────────────────────────
@api_view(['GET'])
def credit_history(request):
    try:
        user_id = request.query_params.get("user_id")
        user    = User.objects.get(id=user_id)

        if user.is_admin():
            logs = CreditLog.objects.select_related("from_user", "to_user").order_by("-created_at")[:200]
        else:
            logs = CreditLog.objects.select_related("from_user", "to_user").filter(
                Q(from_user=user) | Q(to_user=user)
            ).order_by("-created_at")[:100]

        data = [{
            "id":          log.id,
            "action":      log.action,
            "amount":      log.amount,
            "from_user":   log.from_user.username if log.from_user else "System",
            "to_user":     log.to_user.username   if log.to_user   else "Campaign",
            "description": log.description,
            "date":        log.created_at.strftime("%d-%m-%Y %H:%M"),
        } for log in logs]

        return Response({"status": "success", "logs": data})

    except User.DoesNotExist:
        return Response({"status": "failed", "message": "User not found"})
    except Exception as e:
        logger.exception("credit_history error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# UPDATE USER
# ─────────────────────────────────────────
@api_view(['POST'])
def update_user(request):
    try:
        user_id = request.data.get("user_id")
        user = User.objects.get(id=user_id)
        user.username = request.data.get("username", user.username)
        user.password = request.data.get("password", user.password)
        user.role     = request.data.get("role",     user.role)
        user.save()
        return Response({"status": "success"})
    except Exception as e:
        logger.exception("update_user error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# TOGGLE STATUS
# ─────────────────────────────────────────
@api_view(['POST'])
def toggle_user_status(request):
    try:
        user_id = request.data.get("user_id")
        user = User.objects.get(id=user_id)
        user.status = "Deactive" if user.status == "Active" else "Active"
        user.save()
        return Response({"status": "success", "new_status": user.status})
    except Exception as e:
        logger.exception("toggle_user_status error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# RESET PASSWORD
# ─────────────────────────────────────────
@api_view(['POST'])
def reset_password(request):
    try:
        user_id      = request.data.get("user_id")
        new_password = request.data.get("password")
        user = User.objects.get(id=user_id)
        user.password = new_password
        user.save()
        return Response({"status": "success"})
    except Exception as e:
        logger.exception("reset_password error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# DELETE USER
# ─────────────────────────────────────────
@api_view(['POST'])
def delete_user(request):
    try:
        user_id = request.data.get("user_id")
        User.objects.get(id=user_id).delete()
        return Response({"status": "success"})
    except Exception as e:
        logger.exception("delete_user error")
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# FILE UPLOAD HELPERS
# ─────────────────────────────────────────
def upload_to_chatway(file, token):
    try:
        file.seek(0)
        url   = f"https://int.chatway.in/api/file-upload?username={USERNAME}&token={token}"
        files = {"file": (file.name, file.read(), file.content_type or "application/octet-stream")}
        res   = _session.post(url, files=files, timeout=FILE_TIMEOUT)
        data  = res.json()
        if data.get("status") == "success":
            file_url = data.get("url") or data.get("file_url") or data.get("link")
            return file_url, file.name
        return None, None
    except Exception as e:
        logger.error("Chatway upload error: %s", e)
        return None, None


def upload_to_catbox(file):
    try:
        file.seek(0)
        files = {"fileToUpload": (file.name, file.read(), file.content_type or "application/octet-stream")}
        res   = _session.post("https://catbox.moe/user/api.php",
                               files=files, data={"reqtype": "fileupload", "userhash": ""}, timeout=FILE_TIMEOUT)
        if res.status_code == 200 and res.text.startswith("https://"):
            return res.text.strip(), file.name
        return None, None
    except Exception as e:
        logger.error("Catbox error: %s", e)
        return None, None


def upload_file(file):
    url, name = upload_to_chatway(file, TOKENS[0])
    if url:
        return url, name
    return upload_to_catbox(file)


# ─────────────────────────────────────────
# 🔥 SEND HELPERS
# ─────────────────────────────────────────
def _normalize_number(number):
    number = number.strip()
    if not number.startswith("91"):
        number = "91" + number
    return number if NUMBER_RE.fullmatch(number) else None


def _finish(job_id, status):
    _bump_progress(job_id, status)
    return {"status": status}


def send_single_text(args):
    number, message, token_index, job_id = args
    norm = _normalize_number(number)
    if not norm:
        return _finish(job_id, "failed")

    text = _personalize(message, norm)

    for idx in _token_order(token_index):
        try:
            url = (
                f"https://int.chatway.in/api/send-msg"
                f"?username={USERNAME}&number={norm}"
                f"&message={requests.utils.quote(text)}"
                f"&token={TOKENS[idx]}"
            )
            res = _session.get(url, timeout=TEXT_TIMEOUT)
            txt = res.text.lower()
            if "not exist" in txt:
                _mark_token_result(idx, True)
                return _finish(job_id, "nonwa")
            if "reject" in txt:
                _mark_token_result(idx, True)
                return _finish(job_id, "rejected")
            if "success" in txt or "accepted" in txt:
                _mark_token_result(idx, True)
                return _finish(job_id, "success")
            _mark_token_result(idx, False)
        except Exception:
            _mark_token_result(idx, False)
            continue
    return _finish(job_id, "failed")


def send_single_file(args):
    number, message, file_url, file_name, token_index = args
    number = _normalize_number(number)
    if not number:
        return {"status": "failed"}

    for idx in _token_order(token_index):
        try:
            url = (
                f"https://int.chatway.in/api/send-file"
                f"?username={USERNAME}&number={number}"
                f"&message={requests.utils.quote(message)}"
                f"&token={TOKENS[idx]}"
                f"&file_url={requests.utils.quote(file_url, safe='')}"
                f"&file_name={requests.utils.quote(file_name, safe='')}"
            )
            res = _session.get(url, timeout=FILE_TIMEOUT)
            txt = res.text.lower()
            if "not exist" in txt:
                _mark_token_result(idx, True)
                return {"status": "nonwa"}
            if "reject" in txt:
                _mark_token_result(idx, True)
                return {"status": "rejected"}
            if "success" in txt or "accepted" in txt:
                _mark_token_result(idx, True)
                return {"status": "success"}
            _mark_token_result(idx, False)
        except Exception:
            _mark_token_result(idx, False)
            continue
    return {"status": "failed"}


def send_all_files_to_number(args):
    number, message, file_list, token_index, job_id = args
    results = []
    if message:
        results.append(send_single_text((number, message, token_index, None)))
    for i, (file_url, file_name) in enumerate(file_list):
        results.append(send_single_file((number, "", file_url, file_name, (token_index + i) % TOKEN_COUNT)))

    statuses = [r["status"] for r in results]
    if "success" in statuses:    final = "success"
    elif "nonwa" in statuses:    final = "nonwa"
    elif "rejected" in statuses: final = "rejected"
    else:                        final = "failed"

    _bump_progress(job_id, final)
    return {"status": final}


# ─────────────────────────────────────────
# NOTIFY ADMIN
# ─────────────────────────────────────────
def notify_admin(campaign_name, total, success, failed, nonwa, rejected, sender_username, pending=False):
    try:
        admin_number = "918381845350"
        if pending:
            message = (
                f"📥 *New Campaign Queued (PENDING)*\n\n"
                f"👤 User: {sender_username}\n"
                f"📋 Campaign: {campaign_name}\n"
                f"📞 Total Numbers: {total}\n\n"
                f"⏳ Campaign will be processed in 15-25 minutes.\n"
                f"Please process manually and mark complete."
            )
        else:
            message = (
                f"🚀 *New Campaign Alert!*\n\n"
                f"👤 User: {sender_username}\n"
                f"📋 Campaign: {campaign_name}\n"
                f"📊 Total: {total}\n"
                f"✅ Success: {success}\n"
                f"❌ Failed: {failed}\n"
                f"📵 NonWA: {nonwa}\n"
                f"🚫 Rejected: {rejected}"
            )

        def _notify():
            for token in TOKENS:
                try:
                    url = (
                        f"https://int.chatway.in/api/send-msg"
                        f"?username={USERNAME}&number={admin_number}"
                        f"&message={requests.utils.quote(message)}&token={token}"
                    )
                    res = _session.get(url, timeout=ADMIN_TIMEOUT)
                    if "success" in res.text.lower() or "accepted" in res.text.lower():
                        break
                except Exception:
                    continue
        UPLOAD_EXECUTOR.submit(_notify)
    except Exception as e:
        logger.error("notify_admin error: %s", e)


def _collect_uploaded_files(request):
    image_files = request.FILES.getlist("images")[:4]
    video_file  = request.FILES.get("video")
    pdf_file    = request.FILES.get("pdf")

    all_files = list(image_files)
    if video_file:
        all_files.append(video_file)
    if pdf_file:
        all_files.append(pdf_file)

    if not all_files:
        return []

    futures = [UPLOAD_EXECUTOR.submit(upload_file, f) for f in all_files]
    file_list = []
    for fut in futures:
        try:
            url, name = fut.result()
            if url:
                file_list.append((url, name))
        except Exception as e:
            logger.error("parallel upload error: %s", e)
    return file_list


# ─────────────────────────────────────────
# SEND WHATSAPP CAMPAIGN
# ─────────────────────────────────────────
@api_view(['POST'])
def send_whatsapp(request):
    try:
        numbers = (
            request.data.getlist("numbers")
            if hasattr(request.data, "getlist")
            else request.data.get("numbers", [])
        )
        if isinstance(numbers, str):
            numbers = [numbers]
        numbers = list(set(n.strip() for n in numbers if n and n.strip()))

        if not numbers:
            return Response({"status": "error", "message": "No valid numbers provided"})

        message       = request.data.get("message", "")
        user_id       = request.data.get("user_id")
        campaign_name = request.data.get("campaign_name", "N/A")

        # 🔒 Reserve credit for the FULL number count up-front, atomically.
        # This deduction is FINAL — no refund happens later, regardless of
        # success/failed/nonwa/rejected outcome.
        ok, err, credit_left, user = reserve_credit(
            user_id, len(numbers),
            f"Campaign '{campaign_name}' — {len(numbers)} numbers charged"
        )
        if not ok:
            return Response({"status": "error", "message": err})

        # ─────────────────────────────────────────
        # >15 NUMBERS = PENDING MODE
        # ─────────────────────────────────────────
        if len(numbers) > 15:
            file_list = _collect_uploaded_files(request)

            delay_minutes = random.randint(15, 25)
            complete_at   = timezone.now() + timedelta(minutes=delay_minutes)

            campaign = Campaign.objects.create(
                user=user,
                campaign_name=campaign_name,
                message=message,
                total=len(numbers),
                success=0,
                failed=0,
                nonwa=0,
                rejected=0,
                results=[],
                status="pending",
                complete_at=complete_at,
                file_urls=[f[0] for f in file_list],
                number_list=numbers,
            )

            notify_admin(campaign_name, len(numbers), 0, 0, 0, 0, user.username, pending=True)

            return Response({
                "status":      "pending",
                "campaign_id": campaign.id,
                "message":     f"Campaign queued. {len(numbers)} numbers — will be processed in {delay_minutes} minutes.",
                "total":       len(numbers),
                "credit_left": credit_left,
                "file_urls":   [f[0] for f in file_list],
            })

        # ─────────────────────────────────────────
        # ≤15 NUMBERS = NORMAL SEND
        # 🔥 3-per-token batching: numbers[0..2] → token0, [3..5] → token1, ...
        # ─────────────────────────────────────────
        file_list = _collect_uploaded_files(request)

        job_id = str(uuid.uuid4())
        _init_progress(job_id, len(numbers))

        if file_list:
            tasks = [(num, message, file_list, batch_token_index(i), job_id) for i, num in enumerate(numbers)]
            results = list(FILE_EXECUTOR.map(send_all_files_to_number, tasks))
        else:
            tasks = [(num, message, batch_token_index(i), job_id) for i, num in enumerate(numbers)]
            results = list(TEXT_EXECUTOR.map(send_single_text, tasks))

        # 🔁 Auto-retry ONCE for genuine failures (token/network issues) with a
        # shifted token order. nonwa/rejected are terminal and NOT retried.
        failed_indices = [i for i, r in enumerate(results) if r["status"] == "failed"]
        if failed_indices:
            if file_list:
                retry_tasks = [(numbers[i], message, file_list, (batch_token_index(i) + 3) % TOKEN_COUNT, None) for i in failed_indices]
                retry_results = list(FILE_EXECUTOR.map(send_all_files_to_number, retry_tasks))
            else:
                retry_tasks = [(numbers[i], message, (batch_token_index(i) + 3) % TOKEN_COUNT, None) for i in failed_indices]
                retry_results = list(TEXT_EXECUTOR.map(send_single_text, retry_tasks))
            for idx, rr in zip(failed_indices, retry_results):
                results[idx] = rr

        _clear_progress(job_id)

        success = failed = nonwa = rejected = 0
        for r in results:
            if r["status"] == "success":    success  += 1
            elif r["status"] == "nonwa":    nonwa    += 1
            elif r["status"] == "rejected": rejected += 1
            else:                           failed   += 1

        number_results = [{"number": num, "status": r["status"]} for num, r in zip(numbers, results)]

        Campaign.objects.create(
            user=user,
            campaign_name=campaign_name,
            message=message,
            total=len(numbers),
            success=success,
            failed=failed,
            nonwa=nonwa,
            rejected=rejected,
            results=number_results,
            status="completed",
            file_urls=[],
        )

        # 🚫 NO REFUND — full amount reserved above stays deducted no matter
        # what the outcome was (success / failed / nonwa / rejected).
        if not user.is_admin():
            user.refresh_from_db(fields=["credit"])
            final_credit_left = user.credit
        else:
            final_credit_left = "unlimited"

        if len(numbers) > 5:
            try:
                notify_admin(campaign_name, len(numbers), success, failed, nonwa, rejected, user.username)
            except Exception:
                pass

        return Response({
            "status":      "done",
            "success":     success,
            "failed":      failed,
            "nonwa":       nonwa,
            "rejected":    rejected,
            "credit_left": final_credit_left,
            "files_sent":  len(file_list),
            "file_urls":   [f[0] for f in file_list],
            "results":     number_results,
            "tokens_used": TOKEN_COUNT,
        })

    except Exception as e:
        logger.exception("send_whatsapp error")
        return Response({"status": "error", "message": str(e)})