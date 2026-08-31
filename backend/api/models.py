from django.db import models


class User(models.Model):

    ROLE_CHOICES = (
        ("admin", "Admin"),
        ("reseller", "Reseller"),
        ("user", "User"),
    )

    username = models.CharField(
        max_length=100,
        unique=True
    )

    password = models.CharField(
        max_length=255
    )

    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default="user"
    )

    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children"
    )

    credit = models.IntegerField(
        default=0
    )

    status = models.CharField(
        max_length=10,
        default="Active"
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def is_admin(self):
        return self.role == "admin"

    def save(self, *args, **kwargs):
        if self.role != "admin" and self.credit < 0:
            self.credit = 0

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.username} ({self.role}) - {self.credit} cr"


class CreditLog(models.Model):

    ACTION_CHOICES = (
        ("credit", "Credit"),
        ("debit", "Debit"),
    )

    from_user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="sent_logs"
    )

    to_user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="received_logs"
    )

    action = models.CharField(
        max_length=10,
        choices=ACTION_CHOICES
    )

    amount = models.IntegerField()

    description = models.TextField(
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return (
            f"{self.action} {self.amount} | "
            f"{self.from_user} → {self.to_user}"
        )


class Campaign(models.Model):

    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("scheduled", "Scheduled"),
        ("sending", "Sending"),
        ("failed_to_send", "Failed To Send"),
        ("cancelled", "Cancelled"),
    )

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE
    )

    campaign_name = models.CharField(
        max_length=255,
        blank=True,
        default=""
    )

    message = models.TextField()

    # ==============================
    # CTA LINK BUTTON
    # ==============================

    link_label = models.CharField(
        max_length=100,
        blank=True,
        default=""
    )

    link_url = models.URLField(
        blank=True,
        default=""
    )

    # ==============================
    # CTA CALL BUTTON
    # ==============================

    call_label = models.CharField(
        max_length=100,
        blank=True,
        default=""
    )

    call_number = models.CharField(
        max_length=30,
        blank=True,
        default=""
    )

    # ==============================
    # CAMPAIGN STATS
    # ==============================

    total = models.IntegerField(
        default=0
    )

    success = models.IntegerField(
        default=0
    )

    failed = models.IntegerField(
        default=0
    )

    nonwa = models.IntegerField(
        default=0
    )

    rejected = models.IntegerField(
        default=0
    )

    # ==============================
    # CAMPAIGN STATUS
    # ==============================

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="completed"
    )

    # ==============================
    # CAMPAIGN DATA
    # ==============================

    results = models.JSONField(
        default=list,
        blank=True
    )

    number_list = models.JSONField(
        default=list,
        blank=True
    )

    file_urls = models.JSONField(
        default=list,
        blank=True
    )

    # ==============================
    # CAMPAIGN TIMING
    # ==============================

    complete_at = models.DateTimeField(
        null=True,
        blank=True
    )

    scheduled_at = models.DateTimeField(
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return (
            f"{self.user.username} - "
            f"{self.campaign_name} - "
            f"{self.status}"
        )