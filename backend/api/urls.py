from django.urls import path
from . import views


urlpatterns = [

    # =========================================================
    # AUTH & USER MANAGEMENT
    # =========================================================

    path("login/", views.login, name="login"),

    path(
        "create-user/",
        views.create_user,
        name="create_user"
    ),

    path(
        "update-user/",
        views.update_user,
        name="update_user"
    ),

    path(
        "delete-user/",
        views.delete_user,
        name="delete_user"
    ),

    path(
        "toggle-status/",
        views.toggle_user_status,
        name="toggle_user_status"
    ),

    path(
        "reset-password/",
        views.reset_password,
        name="reset_password"
    ),

    path(
        "get-my-users/",
        views.get_my_users,
        name="get_my_users"
    ),


    # =========================================================
    # CREDIT MANAGEMENT
    # =========================================================

    path(
        "add-credit/",
        views.add_credit,
        name="add_credit"
    ),

    path(
        "deduct-credit/",
        views.deduct_credit,
        name="deduct_credit"
    ),

    path(
        "credit-history/",
        views.credit_history,
        name="credit_history"
    ),


    # =========================================================
    # CAMPAIGN — SEND / LIST / RESULTS
    # =========================================================

    path(
        "send-whatsapp/",
        views.send_whatsapp,
        name="send_whatsapp"
    ),

    path(
        "my-campaigns/",
        views.my_campaigns,
        name="my_campaigns"
    ),

    path(
        "campaign-results/",
        views.campaign_results,
        name="campaign_results"
    ),

    path(
        "campaign-results-csv/",
        views.campaign_results_csv,
        name="campaign_results_csv"
    ),

    path(
        "campaign-progress/",
        views.campaign_progress,
        name="campaign_progress"
    ),

    path(
        "complete-campaign/",
        views.complete_campaign,
        name="complete_campaign"
    ),

    path(
        "cancel-campaign/",
        views.cancel_campaign,
        name="cancel_campaign"
    ),


    # =========================================================
    # SCHEDULED CAMPAIGNS
    # =========================================================

    path(
        "run-scheduled-campaigns/",
        views.run_scheduled_campaigns,
        name="run_scheduled_campaigns"
    ),


    # =========================================================
    # ANALYTICS / MONITORING
    # =========================================================

    path(
        "token-health/",
        views.token_health_status,
        name="token_health_status"
    ),

    path(
        "campaign-analytics/",
        views.campaign_analytics,
        name="campaign_analytics"
    ),


    # =========================================================
    # SYSTEM HEALTH
    # =========================================================

    path(
        "health/",
        views.health_check,
        name="health_check"
    ),

]