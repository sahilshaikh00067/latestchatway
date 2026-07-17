import logging
import random
import re
from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
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
"SnNmbFphVTJkUllFYVBmOWtkbjd1Zz09",
"T20rUUJYc3NiOUZjUlVIT1BBajUyQT09",
"bHVjM3VraHg1WlUwMDhCa2pQNHA2QT09",
"a2RaTXNkRUlXT0hVZ0NVNjZwSTlxUT09",
"aDl4RzQ0bG5Cc3liOUZvYkhyUG1HUT09",
"dnFSMzk0ZExtbWVjVEhRZ1IrU3NsUT09",
"Um1KbnhWS0FKQVRBclZlZUhUbUFnQT09",
]
TOKEN_COUNT = len(TOKENS)

MAX_WORKERS_TEXT = 20   # per-token concurrency for text-only sends
MAX_WORKERS_FILE  = 10  # per-token concurrency for sends that include a file

# ─────────────────────────────────────────
# 🔥 SHARED HTTP SESSION — connection pooling = much faster bulk sends
# (avoids a fresh TCP/TLS handshake on every single message)
# ─────────────────────────────────────────
_session = requests.Session()
_retry_policy = Retry(
    total=1,
    connect=1,
    read=1,
    backoff_factor=0.2,
    status_forcelist=[500, 502, 503, 504],
)
_adapter = HTTPAdapter(pool_connections=200, pool_maxsize=200, max_retries=_retry_policy)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)


# ═════════════════════════════════════════════════════════════════════════
# 🔒 CREDIT HELPERS — every credit mutation goes through these so there is
# exactly ONE place that can ever change a user's balance. Each helper
# locks the user row (select_for_update) inside a short atomic transaction,
# so concurrent requests can never race each other into over-spending or
# double-deducting credit.
# ═════════════════════════════════════════════════════════════════════════

def reserve_credit(user_id, amount, description):
    """
    Locks the user row and atomically deducts `amount` credits up-front,
    after verifying the user actually has enough. Returns:
        (ok: bool, error_message: str|None, credit_left, user)
    Admins are unlimited and always pass without being charged.
    This is called BEFORE any slow network/sending work starts, and the
    lock is held only for the duration of this tiny transaction — never
    during the actual WhatsApp sending, which can take minutes.
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
    Locks the user row and atomically refunds `amount` credits back
    (e.g. for numbers that ended up failed/non-WA/rejected after a
    reservation was already made). Admins are skipped since they were
    never charged in the first place. Safe to call with amount <= 0 (no-op).
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
# MY CAMPAIGNS LIST
# ─────────────────────────────────────────
@api_view(['GET'])
def my_campaigns(request):
    # Pehle pending campaigns auto-complete karo
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
# "complete now" admin action, so there is one source of truth.
# ─────────────────────────────────────────
def _simulate_and_close_campaign(campaign):
    """
    Randomly simulates delivery outcomes for a pending campaign and closes
    it out. Credit for this campaign's numbers was already fully reserved
    when the campaign was created, so here we only REFUND the portion that
    didn't end up "success" — we never re-deduct.
    """
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

    # Refund the credits reserved for numbers that did NOT succeed.
    refund_credit(
        campaign.user_id,
        simulated_failed,
        f"Campaign '{campaign.campaign_name}' completed — refund for {simulated_failed} non-success",
    )

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
            # Consistent lock ordering (lower id first) avoids deadlocks
            # when two transfers between the same pair of users run at once.
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
        res   = _session.post(url, files=files, timeout=30)
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
                               files=files, data={"reqtype": "fileupload", "userhash": ""}, timeout=30)
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
# 🔥 SEND HELPERS — TOKEN_COUNT ke hisaab se rotate, shared session = fast
# ─────────────────────────────────────────
def _normalize_number(number):
    number = number.strip()
    if not number.startswith("91"):
        number = "91" + number
    if not re.fullmatch(r"91\d{10}", number):
        return None
    return number


def _token_order(token_index):
    order = [token_index % TOKEN_COUNT]
    for i in range(TOKEN_COUNT):
        if i not in order:
            order.append(i)
    return order


def send_single_text(args):
    number, message, token_index = args
    number = _normalize_number(number)
    if not number:
        return {"status": "failed"}

    for idx in _token_order(token_index):
        try:
            url = (
                f"https://int.chatway.in/api/send-msg"
                f"?username={USERNAME}&number={number}"
                f"&message={requests.utils.quote(message)}"
                f"&token={TOKENS[idx]}"
            )
            res = _session.get(url, timeout=8)
            txt = res.text.lower()
            if "not exist" in txt:                     return {"status": "nonwa"}
            if "reject" in txt:                         return {"status": "rejected"}
            if "success" in txt or "accepted" in txt:   return {"status": "success"}
        except Exception:
            continue
    return {"status": "failed"}


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
            res = _session.get(url, timeout=12)
            txt = res.text.lower()
            if "not exist" in txt:                     return {"status": "nonwa"}
            if "reject" in txt:                         return {"status": "rejected"}
            if "success" in txt or "accepted" in txt:   return {"status": "success"}
        except Exception:
            continue
    return {"status": "failed"}


def send_all_files_to_number(args):
    number, message, file_list, token_index = args
    results = []
    if message:
        results.append(send_single_text((number, message, token_index)))
    for i, (file_url, file_name) in enumerate(file_list):
        results.append(send_single_file((number, "", file_url, file_name, (token_index + i) % TOKEN_COUNT)))

    statuses = [r["status"] for r in results]
    if "success"  in statuses: return {"status": "success"}
    if "nonwa"    in statuses: return {"status": "nonwa"}
    if "rejected" in statuses: return {"status": "rejected"}
    return {"status": "failed"}


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
        for token in TOKENS:
            try:
                url = (
                    f"https://int.chatway.in/api/send-msg"
                    f"?username={USERNAME}&number={admin_number}"
                    f"&message={requests.utils.quote(message)}&token={token}"
                )
                res = _session.get(url, timeout=5)
                if "success" in res.text.lower() or "accepted" in res.text.lower():
                    break
            except Exception:
                continue
    except Exception as e:
        logger.error("notify_admin error: %s", e)


def _collect_uploaded_files(request):
    image_files = request.FILES.getlist("images")
    video_file  = request.FILES.get("video")
    pdf_file    = request.FILES.get("pdf")

    file_list = []
    for img in image_files[:4]:
        url, name = upload_file(img)
        if url:
            file_list.append((url, name))
    if video_file:
        url, name = upload_file(video_file)
        if url:
            file_list.append((url, name))
    if pdf_file:
        url, name = upload_file(pdf_file)
        if url:
            file_list.append((url, name))
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
        # This is the fix that makes credit deduction bullet-proof: no two
        # requests (or a pending + an immediate send) can ever both pass
        # the check and overspend the same balance.
        ok, err, credit_left, user = reserve_credit(
            user_id, len(numbers),
            f"Campaign '{campaign_name}' — {len(numbers)} numbers reserved"
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
        # ≤15 NUMBERS = NORMAL SEND (credit already reserved above)
        # ─────────────────────────────────────────
        file_list = _collect_uploaded_files(request)
        worker_cap = max(len(numbers), 1)

        if file_list:
            tasks = [(num, message, file_list, i % TOKEN_COUNT) for i, num in enumerate(numbers)]
            with ThreadPoolExecutor(max_workers=min(worker_cap, TOKEN_COUNT * MAX_WORKERS_FILE)) as executor:
                results = list(executor.map(send_all_files_to_number, tasks))
        else:
            tasks = [(num, message, i % TOKEN_COUNT) for i, num in enumerate(numbers)]
            with ThreadPoolExecutor(max_workers=min(worker_cap, TOKEN_COUNT * MAX_WORKERS_TEXT)) as executor:
                results = list(executor.map(send_single_text, tasks))

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

        # Refund credit reserved for numbers that did NOT succeed
        # (nonwa + rejected + failed) — only actual "success" stays charged.
        not_success = len(numbers) - success
        refund_credit(
            user_id, not_success,
            f"Campaign '{campaign_name}' — refund for {not_success} non-success (nonwa/rejected/failed)"
        )
        final_credit_left = "unlimited" if user.is_admin() else (user.credit + not_success if not user.is_admin() else "unlimited")
        # (recompute a fresh accurate value instead of guessing)
        if not user.is_admin():
            user.refresh_from_db(fields=["credit"])
            final_credit_left = user.credit

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
    