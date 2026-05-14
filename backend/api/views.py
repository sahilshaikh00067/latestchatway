from django.db import transaction
from django.db.models import Q
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import User, CreditLog, Campaign
import requests
from concurrent.futures import ThreadPoolExecutor
import re

USERNAME = "APIDEMO"
TOKENS = [
    "REROSE5POUh4MVdLd2oyMUNOV3BOQT09",
    "c0Z6bG9mYTlTQmFMeEVXYlgyRzdzZz09"
]


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
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# CREATE USER  (admin → reseller/user, reseller → user only)
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

        creator = User.objects.get(id=creator_id)

        # Permission checks
        if creator.role == "user":
            return Response({"status": "failed", "message": "Users cannot create accounts"})
        if creator.role == "reseller" and role == "admin":
            return Response({"status": "failed", "message": "Reseller cannot create admin"})

        # Credit check (admin ke paas unlimited credit)
        if credit > 0 and not creator.is_admin():
            if creator.credit < credit:
                return Response({
                    "status":  "failed",
                    "message": f"Insufficient credits. You have {creator.credit}"
                })

        if User.objects.filter(username=username).exists():
            return Response({"status": "failed", "message": "Username already exists"})

        with transaction.atomic():
            new_user = User.objects.create(
                username=username,
                password=password,
                role=role,
                credit=credit,
                parent=creator,
                status="Active"
            )

            # Admin ke credit nahi katenge, baaki ke katenge
            if credit > 0 and not creator.is_admin():
                creator.credit -= credit
                creator.save()

            # Log
            if credit > 0:
                CreditLog.objects.create(
                    from_user=creator,
                    to_user=new_user,
                    action="credit",
                    amount=credit,
                    description=f"Initial credit on account creation by {creator.username}"
                )

        return Response({
            "status":   "success",
            "message":  f"{role.capitalize()} '{username}' created successfully",
            "user_id":  new_user.id,
            "username": new_user.username,
            "role":     new_user.role,
            "credit":   new_user.credit,
            "your_credit": "unlimited" if creator.is_admin() else creator.credit,
        })

    except User.DoesNotExist:
        return Response({"status": "failed", "message": "Creator not found"})
    except Exception as e:
        return Response({"status": "error", "message": str(e)})




#campaign report

@api_view(['GET'])
def campaign_results(request):
    try:
        campaign_id = request.query_params.get("campaign_id")
        campaign = Campaign.objects.get(id=campaign_id)
        return Response({
            "status": "success",
            "results": campaign.results
        })
    except Campaign.DoesNotExist:
        return Response({"status": "failed", "message": "Campaign not found"})
    except Exception as e:
        return Response({"status": "error", "message": str(e)})
# ─────────────────────────────────────────
# ADD CREDIT  (giver → receiver)
# ─────────────────────────────────────────
@api_view(['POST'])
def add_credit(request):
    try:
        from_id = request.data.get("from_id")
        to_id   = request.data.get("to_id")
        amount  = int(request.data.get("amount", 0))

        if amount <= 0:
            return Response({"status": "failed", "message": "Amount must be > 0"})

        from_user = User.objects.get(id=from_id)
        to_user   = User.objects.get(id=to_id)

        # Admin ke paas unlimited, baaki check karo
        if not from_user.is_admin():
            if from_user.credit < amount:
                return Response({
                    "status":  "failed",
                    "message": f"Insufficient credits. You have {from_user.credit}"
                })

        with transaction.atomic():
            if not from_user.is_admin():
                from_user.credit -= amount
                from_user.save()

            to_user.credit += amount
            to_user.save()

            CreditLog.objects.create(
                from_user=from_user,
                to_user=to_user,
                action="credit",
                amount=amount,
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
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# DEDUCT CREDIT  (admin credit wapas le sakta hai)
# ─────────────────────────────────────────
@api_view(['POST'])
def deduct_credit(request):
    try:
        from_id = request.data.get("from_id")   # Admin/Reseller jo le raha hai
        to_id   = request.data.get("to_id")     # Jisse le raha hai
        amount  = int(request.data.get("amount", 0))

        if amount <= 0:
            return Response({"status": "failed", "message": "Amount must be > 0"})

        from_user = User.objects.get(id=from_id)
        to_user   = User.objects.get(id=to_id)

        # Sirf admin ya parent le sakta hai
        if not from_user.is_admin() and to_user.parent_id != from_user.id:
            return Response({"status": "failed", "message": "Not authorized"})

        if to_user.credit < amount:
            return Response({
                "status":  "failed",
                "message": f"{to_user.username} has only {to_user.credit} credits"
            })

        with transaction.atomic():
            to_user.credit -= amount
            to_user.save()

            # Admin ke paas wapas nahi jata (unlimited), reseller ke paas jata hai
            if not from_user.is_admin():
                from_user.credit += amount
                from_user.save()

            CreditLog.objects.create(
                from_user=from_user,
                to_user=to_user,
                action="debit",
                amount=amount,
                description=f"Credit deducted by {from_user.username}"
            )

        return Response({
            "status":         "success",
            "message":        f"{amount} credits deducted from {to_user.username}",
            "your_credit":    "unlimited" if from_user.is_admin() else from_user.credit,
            "target_credit":  to_user.credit,
        })

    except User.DoesNotExist:
        return Response({"status": "failed", "message": "User not found"})
    except Exception as e:
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
            users = User.objects.exclude(id=user.id).order_by("-created_at")
        else:
            users = User.objects.filter(parent=user).order_by("-created_at")

        data = []
        for u in users:
            data.append({
                "id":         u.id,
                "username":   u.username,
                "role":       u.role,
                "credit":     u.credit,
                "status":     u.status,
                "parent":     u.parent.username if u.parent else "Admin",
                "created_at": u.created_at.strftime("%d-%m-%Y"),
                "sub_count":  u.children.count(),
            })

        return Response({"status": "success", "users": data})

    except User.DoesNotExist:
        return Response({"status": "failed", "message": "User not found"})
    except Exception as e:
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
            logs = CreditLog.objects.all().order_by("-created_at")[:200]
        else:
            logs = CreditLog.objects.filter(
                Q(from_user=user) | Q(to_user=user)
            ).order_by("-created_at")[:100]

        data = []
        for log in logs:
            data.append({
                "id":          log.id,
                "action":      log.action,
                "amount":      log.amount,
                "from_user":   log.from_user.username if log.from_user else "System",
                "to_user":     log.to_user.username   if log.to_user   else "Campaign",
                "description": log.description,
                "date":        log.created_at.strftime("%d-%m-%Y %H:%M"),
            })

        return Response({"status": "success", "logs": data})

    except User.DoesNotExist:
        return Response({"status": "failed", "message": "User not found"})
    except Exception as e:
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
        return Response({"status": "error", "message": str(e)})


# ─────────────────────────────────────────
# FILE UPLOAD HELPERS
# ─────────────────────────────────────────
def upload_to_chatway(file, token):
    try:
        file.seek(0)
        url   = f"https://int.chatway.in/api/file-upload?username={USERNAME}&token={token}"
        files = {"file": (file.name, file.read(), file.content_type or "application/octet-stream")}
        res   = requests.post(url, files=files, timeout=30)
        data  = res.json()
        if data.get("status") == "success":
            file_url = data.get("url") or data.get("file_url") or data.get("link")
            return file_url, file.name
        return None, None
    except Exception as e:
        print(f"Chatway upload error: {e}")
        return None, None


def upload_to_catbox(file):
    try:
        file.seek(0)
        files = {"fileToUpload": (file.name, file.read(), file.content_type or "application/octet-stream")}
        res   = requests.post("https://catbox.moe/user/api.php",
                              files=files, data={"reqtype": "fileupload", "userhash": ""}, timeout=30)
        if res.status_code == 200 and res.text.startswith("https://"):
            return res.text.strip(), file.name
        return None, None
    except Exception as e:
        print(f"Catbox error: {e}")
        return None, None


def upload_file(file):
    url, name = upload_to_chatway(file, TOKENS[0])
    if url:
        return url, name
    return upload_to_catbox(file)


# ─────────────────────────────────────────
# SEND HELPERS
# ─────────────────────────────────────────
def send_single_text(args):
    number, message, token_index = args
    try:
        number = number.strip()
        if not number.startswith("91"):
            number = "91" + number
        if not re.fullmatch(r"91\d{10}", number):
            return {"status": "failed"}

        for idx in [token_index, 1 - token_index]:
            try:
                url = (
                    f"https://int.chatway.in/api/send-msg"
                    f"?username={USERNAME}&number={number}"
                    f"&message={requests.utils.quote(message)}"
                    f"&token={TOKENS[idx]}"
                )
                res = requests.get(url, timeout=5)
                txt = res.text.lower()
                if "not exist" in txt:  return {"status": "nonwa"}
                if "reject"    in txt:  return {"status": "rejected"}
                if "success"   in txt or "accepted" in txt: return {"status": "success"}
            except:
                continue
        return {"status": "failed"}
    except:
        return {"status": "failed"}


def send_single_file(args):
    number, message, file_url, file_name, token_index = args
    try:
        number = number.strip()
        if not number.startswith("91"):
            number = "91" + number
        if not re.fullmatch(r"91\d{10}", number):
            return {"status": "failed"}

        for idx in [token_index, 1 - token_index]:
            try:
                url = (
                    f"https://int.chatway.in/api/send-file"
                    f"?username={USERNAME}&number={number}"
                    f"&message={requests.utils.quote(message)}"
                    f"&token={TOKENS[idx]}"
                    f"&file_url={requests.utils.quote(file_url, safe='')}"
                    f"&file_name={requests.utils.quote(file_name, safe='')}"
                )
                res = requests.get(url, timeout=10)
                txt = res.text.lower()
                if "not exist" in txt:  return {"status": "nonwa"}
                if "reject"    in txt:  return {"status": "rejected"}
                if "success"   in txt or "accepted" in txt: return {"status": "success"}
            except:
                continue
        return {"status": "failed"}
    except:
        return {"status": "failed"}


def send_all_files_to_number(args):
    number, message, file_list, token_index = args
    results = []
    if message:
        results.append(send_single_text((number, message, token_index)))
    for i, (file_url, file_name) in enumerate(file_list):
        results.append(send_single_file((number, "", file_url, file_name, (token_index + i) % 2)))

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
                f"⏳ Campaign will be processed in 30-45 minutes.\n"
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
                res = requests.get(url, timeout=5)
                if "success" in res.text.lower() or "accepted" in res.text.lower():
                    break
            except:
                continue
    except Exception as e:
        print(f"notify_admin error: {e}")

# ─────────────────────────────────────────
# SEND WHATSAPP CAMPAIGN  (auto deduct credit)
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

        numbers = list(set(numbers))

        message       = request.data.get("message", "")
        user_id       = request.data.get("user_id")
        campaign_name = request.data.get("campaign_name", "N/A")

        user = User.objects.get(id=user_id)

        # Credit check (admin exempt)
        if not user.is_admin() and user.credit < len(numbers):
            return Response({
                "status": "error",
                "message": f"Insufficient credits. You have {user.credit}, need {len(numbers)}"
            })

        # ─────────────────────────────────────────
        # 🔥 >15 NUMBERS = PENDING MODE
        # ─────────────────────────────────────────
        if len(numbers) > 15:
            # FILES upload karo (URLs chahiye notification ke liye)
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

            # Campaign PENDING save karo
            with transaction.atomic():
                campaign = Campaign.objects.create(
                    user=user,
                    message=message,
                    total=len(numbers),
                    success=0,
                    failed=0,
                    results=[],
                    status="pending",           # ← status field add karna hoga model mein
                    campaign_name=campaign_name, # ← campaign_name field add karna hoga
                )

            # Admin ko WhatsApp notify karo
            notify_admin(
                campaign_name,
                len(numbers),
                0,   # success abhi 0
                0,   # failed abhi 0
                0,
                0,
                user.username,
                pending=True
            )

            return Response({
                "status":        "pending",
                "campaign_id":   campaign.id,
                "message":       f"Campaign queued. {len(numbers)} numbers — will be processed in 30-45 minutes.",
                "total":         len(numbers),
                "credit_left":   "unlimited" if user.is_admin() else user.credit,
                "files_sent":    len(file_list),
                "file_urls":     [f[0] for f in file_list],
            })


        # ─────────────────────────────────────────
        # ≤15 NUMBERS = NORMAL SEND (existing code)
        # ─────────────────────────────────────────
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

        success  = 0
        failed   = 0
        nonwa    = 0
        rejected = 0

        if file_list:
            tasks = [(num, message, file_list, i % 2) for i, num in enumerate(numbers)]
            with ThreadPoolExecutor(max_workers=20) as executor:
                results = list(executor.map(send_all_files_to_number, tasks))
        else:
            tasks = [(num, message, i % 2) for i, num in enumerate(numbers)]
            with ThreadPoolExecutor(max_workers=40) as executor:
                results = list(executor.map(send_single_text, tasks))

        for r in results:
            if r["status"] == "success":   success  += 1
            elif r["status"] == "nonwa":   nonwa    += 1
            elif r["status"] == "rejected":rejected += 1
            else:                          failed   += 1

        number_results = [{"number": num, "status": r["status"]} for num, r in zip(numbers, results)]

        with transaction.atomic():
            if not user.is_admin() and success > 0:
                user.credit -= success
                user.save()
                CreditLog.objects.create(
                    from_user=user,
                    to_user=None,
                    action="debit",
                    amount=success,
                    description=f"Campaign '{campaign_name}' — {success} messages sent"
                )
            Campaign.objects.create(
                user=user,
                message=message,
                total=len(numbers),
                success=success,
                failed=failed,
                results=number_results,
                status="completed",
                campaign_name=campaign_name,
            )

        return Response({
            "status":      "done",
            "success":     success,
            "failed":      failed,
            "nonwa":       nonwa,
            "rejected":    rejected,
            "credit_left": "unlimited" if user.is_admin() else user.credit,
            "files_sent":  len(file_list),
            "file_urls":   [f[0] for f in file_list],
            "results":     number_results
        })

    except Exception as e:
        print("SEND ERROR:", e)
        return Response({"status": "error", "message": str(e)})