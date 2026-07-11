from django.urls import path
from . import views

urlpatterns = [
    path("login/",            views.login),
    path("create-user/",      views.create_user),
    path("update-user/",      views.update_user),
    path("delete-user/",      views.delete_user),
    path("toggle-status/",    views.toggle_user_status),
    path("reset-password/",   views.reset_password),
    path("add-credit/",       views.add_credit),
    path("deduct-credit/",    views.deduct_credit),
    path("get-my-users/",     views.get_my_users),
    path("credit-history/",   views.credit_history),
    path("send-whatsapp/",    views.send_whatsapp),
    path("campaign-results/", views.campaign_results),
    path("my-campaigns/",     views.my_campaigns),      # ← ADD
    path("complete-campaign/", views.complete_campaign), # ← ADD
    path("health/", views.health_check),
]