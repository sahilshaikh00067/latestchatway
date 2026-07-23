from django.urls import path
from . import views

urlpatterns = [
    # ── Auth & user management ──────────────────────────────
    path("login/",                    views.login),
    path("create-user/",              views.create_user),
    path("update-user/",              views.update_user),
    path("delete-user/",              views.delete_user),
    path("toggle-status/",            views.toggle_user_status),
    path("reset-password/",           views.reset_password),
    path("get-my-users/",             views.get_my_users),

    # ── Credit management ───────────────────────────────────
    path("add-credit/",               views.add_credit),
    path("deduct-credit/",            views.deduct_credit),
    path("credit-history/",           views.credit_history),

    # ── Campaigns — send / list / results ───────────────────
    path("send-whatsapp/",            views.send_whatsapp),
    path("my-campaigns/",             views.my_campaigns),
    path("campaign-results/",         views.campaign_results),
    path("campaign-results-csv/",     views.campaign_results_csv),   # 🆕 CSV export
    path("campaign-progress/",        views.campaign_progress),      # 🆕 live progress bar (poll with job_id)
    path("complete-campaign/",        views.complete_campaign),
    path("cancel-campaign/",          views.cancel_campaign),        # 🆕 cancel pending/scheduled + refund

    # ── Scheduling ───────────────────────────────────────────
    path("run-scheduled-campaigns/",  views.run_scheduled_campaigns),# 🆕 hit via cron every 1-2 min

    # ── Analytics / monitoring ──────────────────────────────
    path("token-health/",             views.token_health_status),    # 🆕 per-token health dashboard
    path("campaign-analytics/",       views.campaign_analytics),     # 🆕 success-rate / volume / top-failing

    # ── Misc ─────────────────────────────────────────────────
    path("health/",                   views.health_check),
]